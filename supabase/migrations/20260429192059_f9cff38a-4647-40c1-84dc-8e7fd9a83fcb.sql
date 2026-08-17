
-- =========================================================
-- 1) ALTER shift_swap_requests
-- =========================================================
ALTER TABLE public.shift_swap_requests
  ADD COLUMN IF NOT EXISTS counterparty_assignment_id uuid REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS counterparty_notes text,
  ADD COLUMN IF NOT EXISTS counterparty_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS counterparty_responded_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS admin_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS executed_at timestamptz;

-- =========================================================
-- 2) Migração segura do legado
-- =========================================================
DO $$
DECLARE
  _legacy_assignment_ids uuid[];
BEGIN
  -- Coletar plantões envolvidos em solicitações legadas pendentes
  SELECT array_agg(DISTINCT a_id) INTO _legacy_assignment_ids
  FROM (
    SELECT assignment_id AS a_id FROM public.shift_swap_requests WHERE status = 'pendente'
  ) s;

  -- Soltar plantões travados em "troca_pendente" oriundos de legado
  IF _legacy_assignment_ids IS NOT NULL THEN
    UPDATE public.shift_assignments
       SET status = 'confirmado'
     WHERE id = ANY(_legacy_assignment_ids)
       AND status = 'troca_pendente';
  END IF;

  -- Renomear status legados (apenas se ainda existirem)
  UPDATE public.shift_swap_requests
     SET status = 'legado_pendente',
         admin_notes = COALESCE(admin_notes, '') || E'\n[Migrado do fluxo legado em ' || now()::text || ']'
   WHERE status = 'pendente';

  UPDATE public.shift_swap_requests
     SET status = 'legado_aprovada',
         admin_notes = COALESCE(admin_notes, '') || E'\n[Migrado do fluxo legado em ' || now()::text || ']'
   WHERE status = 'aprovada';

  UPDATE public.shift_swap_requests
     SET status = 'legado_rejeitada',
         admin_notes = COALESCE(admin_notes, '') || E'\n[Migrado do fluxo legado em ' || now()::text || ']'
   WHERE status = 'rejeitada';
END$$;

-- =========================================================
-- 3) RLS - reset políticas antigas e criar novas
-- =========================================================
DROP POLICY IF EXISTS "Masters can manage swap requests" ON public.shift_swap_requests;
DROP POLICY IF EXISTS "Users can create swap requests" ON public.shift_swap_requests;
DROP POLICY IF EXISTS "Users can view swap requests" ON public.shift_swap_requests;

ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Swap requests visibility"
ON public.shift_swap_requests
FOR SELECT
TO authenticated
USING (
  public.is_master(auth.uid())
  OR from_user_id = auth.uid()
  OR to_user_id = auth.uid()
  OR counterparty_responded_by = auth.uid()
  OR public.has_company_access(auth.uid(), public.get_assignment_company_id(assignment_id))
);

-- Sem políticas de INSERT/UPDATE/DELETE diretas: somente via RPC SECURITY DEFINER

-- =========================================================
-- 4) Tabela de fila de e-mails
-- =========================================================
CREATE TABLE IF NOT EXISTS public.schedule_swap_email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swap_request_id uuid NOT NULL REFERENCES public.shift_swap_requests(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'swap_confirmed',
  recipient_user_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swap_email_queue_status_created
  ON public.schedule_swap_email_queue(status, created_at);

ALTER TABLE public.schedule_swap_email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages swap email queue" ON public.schedule_swap_email_queue;
CREATE POLICY "Service role manages swap email queue"
ON public.schedule_swap_email_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =========================================================
-- 5) Função: notificar admins reais da empresa
-- =========================================================
CREATE OR REPLACE FUNCTION public.notify_schedule_admins(
  _company_id uuid,
  _title text,
  _message text,
  _link text,
  _exclude_user_ids uuid[] DEFAULT ARRAY[]::uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT ur.user_id)
    INTO _admin_ids
    FROM public.user_roles ur
   WHERE ur.role IN ('master','super-admin')
     AND public.has_company_access(ur.user_id, _company_id)
     AND NOT (ur.user_id = ANY(COALESCE(_exclude_user_ids, ARRAY[]::uuid[])));

  IF _admin_ids IS NOT NULL THEN
    -- [LGPD] dados de producao removidos na limpeza do fork Braseg

  END IF;
END$$;

-- =========================================================
-- 6) RPC: request_shift_swap
-- =========================================================
CREATE OR REPLACE FUNCTION public.request_shift_swap(
  p_assignment_id uuid,
  p_type text,
  p_to_user_id uuid,
  p_counterparty_assignment_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _assignment record;
  _counter record;
  _company_id uuid;
  _request_id uuid;
  _from_name text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_type NOT IN ('troca','passagem') THEN
    RAISE EXCEPTION 'Tipo inválido: %', p_type;
  END IF;

  SELECT a.*, public.get_grade_company_id(a.grade_id) AS company_id
    INTO _assignment
    FROM public.shift_assignments a
   WHERE a.id = p_assignment_id;

  IF _assignment.id IS NULL THEN
    RAISE EXCEPTION 'Plantão não encontrado';
  END IF;
  IF _assignment.user_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'Você não é titular deste plantão';
  END IF;
  IF _assignment.status <> 'confirmado' THEN
    RAISE EXCEPTION 'O plantão precisa estar confirmado para solicitar troca/passagem';
  END IF;

  _company_id := _assignment.company_id;

  IF p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o profissional alvo';
  END IF;
  IF p_to_user_id = _uid THEN
    RAISE EXCEPTION 'Você não pode solicitar para si mesmo';
  END IF;
  IF NOT public.has_company_access(p_to_user_id, _company_id) THEN
    RAISE EXCEPTION 'Profissional alvo não pertence à empresa';
  END IF;

  -- impedir duplicidade ativa para o mesmo plantão
  IF EXISTS (
    SELECT 1 FROM public.shift_swap_requests
     WHERE assignment_id = p_assignment_id
       AND status IN ('aguardando_medico','aguardando_admin')
  ) THEN
    RAISE EXCEPTION 'Já existe uma solicitação ativa para este plantão';
  END IF;

  IF p_type = 'troca' THEN
    IF p_counterparty_assignment_id IS NULL THEN
      RAISE EXCEPTION 'Selecione o plantão de retorno';
    END IF;

    SELECT a.*, public.get_grade_company_id(a.grade_id) AS company_id
      INTO _counter
      FROM public.shift_assignments a
     WHERE a.id = p_counterparty_assignment_id;

    IF _counter.id IS NULL THEN
      RAISE EXCEPTION 'Plantão de retorno não encontrado';
    END IF;
    IF _counter.user_id IS DISTINCT FROM p_to_user_id THEN
      RAISE EXCEPTION 'Plantão de retorno não pertence ao profissional escolhido';
    END IF;
    IF _counter.status <> 'confirmado' THEN
      RAISE EXCEPTION 'Plantão de retorno precisa estar confirmado';
    END IF;
    IF _counter.company_id IS DISTINCT FROM _company_id THEN
      RAISE EXCEPTION 'Plantões de empresas diferentes';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.shift_swap_requests
       WHERE (assignment_id = p_counterparty_assignment_id
              OR counterparty_assignment_id = p_counterparty_assignment_id)
         AND status IN ('aguardando_medico','aguardando_admin')
    ) THEN
      RAISE EXCEPTION 'O plantão de retorno já está em outra solicitação ativa';
    END IF;
  END IF;

  -- [LGPD] dados de producao removidos na limpeza do fork Braseg


  -- marcar plantões como troca_pendente
  UPDATE public.shift_assignments SET status = 'troca_pendente' WHERE id = p_assignment_id;
  IF p_type = 'troca' THEN
    UPDATE public.shift_assignments SET status = 'troca_pendente' WHERE id = p_counterparty_assignment_id;
  END IF;

  -- Notificar contraparte
  SELECT full_name INTO _from_name FROM public.user_profiles WHERE id = _uid;
  -- [LGPD] dados de producao removidos na limpeza do fork Braseg


  RETURN _request_id;
END$$;

-- =========================================================
-- 7) RPC: respond_shift_swap_request
-- =========================================================
CREATE OR REPLACE FUNCTION public.respond_shift_swap_request(
  p_request_id uuid,
  p_accept boolean,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req record;
  _company_id uuid;
  _from_name text;
  _to_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO _req FROM public.shift_swap_requests WHERE id = p_request_id FOR UPDATE;
  IF _req.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF _req.to_user_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'Apenas a contraparte pode responder';
  END IF;
  IF _req.status <> 'aguardando_medico' THEN
    RAISE EXCEPTION 'Solicitação não está aguardando resposta do médico';
  END IF;

  _company_id := public.get_assignment_company_id(_req.assignment_id);

  IF p_accept THEN
    UPDATE public.shift_swap_requests
       SET status = 'aguardando_admin',
           counterparty_notes = p_notes,
           counterparty_responded_at = now(),
           counterparty_responded_by = _uid
     WHERE id = p_request_id;

    SELECT full_name INTO _to_name FROM public.user_profiles WHERE id = _uid;

    -- [LGPD] dados de producao removidos na limpeza do fork Braseg


    PERFORM public.notify_schedule_admins(
      _company_id,
      'Troca de plantão aguarda aprovação',
      'Uma solicitação foi aceita pelos médicos e precisa de revisão.',
      '/escalas',
      ARRAY[_uid, _req.from_user_id]
    );
  ELSE
    UPDATE public.shift_swap_requests
       SET status = 'recusada_medico',
           counterparty_notes = p_notes,
           counterparty_responded_at = now(),
           counterparty_responded_by = _uid
     WHERE id = p_request_id;

    UPDATE public.shift_assignments SET status = 'confirmado' WHERE id = _req.assignment_id;
    IF _req.counterparty_assignment_id IS NOT NULL THEN
      UPDATE public.shift_assignments SET status = 'confirmado' WHERE id = _req.counterparty_assignment_id;
    END IF;

    SELECT full_name INTO _to_name FROM public.user_profiles WHERE id = _uid;
    -- [LGPD] dados de producao removidos na limpeza do fork Braseg

  END IF;
END$$;

-- =========================================================
-- 8) RPC: review_shift_swap_request (admin)
-- =========================================================
CREATE OR REPLACE FUNCTION public.review_shift_swap_request(
  p_request_id uuid,
  p_approve boolean,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req record;
  _company_id uuid;
  _main record;
  _counter record;
  _queue_id uuid;
  _recipients uuid[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO _req FROM public.shift_swap_requests WHERE id = p_request_id FOR UPDATE;
  IF _req.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF _req.status <> 'aguardando_admin' THEN
    RAISE EXCEPTION 'Solicitação não está aguardando admin';
  END IF;

  _company_id := public.get_assignment_company_id(_req.assignment_id);
  IF NOT public.is_master(_uid) OR NOT public.has_company_access(_uid, _company_id) THEN
    RAISE EXCEPTION 'Sem permissão para revisar';
  END IF;

  SELECT * INTO _main FROM public.shift_assignments WHERE id = _req.assignment_id FOR UPDATE;
  IF _main.user_id IS DISTINCT FROM _req.from_user_id THEN
    RAISE EXCEPTION 'Plantão principal não pertence mais ao solicitante';
  END IF;
  IF _main.status <> 'troca_pendente' THEN
    RAISE EXCEPTION 'Plantão principal não está mais em troca pendente';
  END IF;

  IF _req.type = 'troca' AND _req.counterparty_assignment_id IS NOT NULL THEN
    SELECT * INTO _counter FROM public.shift_assignments WHERE id = _req.counterparty_assignment_id FOR UPDATE;
    IF _counter.user_id IS DISTINCT FROM _req.to_user_id THEN
      RAISE EXCEPTION 'Plantão de retorno não pertence mais à contraparte';
    END IF;
    IF _counter.status <> 'troca_pendente' THEN
      RAISE EXCEPTION 'Plantão de retorno não está mais em troca pendente';
    END IF;
  END IF;

  IF p_approve THEN
    -- Executar troca
    UPDATE public.shift_assignments
       SET user_id = _req.to_user_id,
           original_user_id = COALESCE(original_user_id, _req.from_user_id),
           status = 'confirmado'
     WHERE id = _req.assignment_id;

    IF _req.type = 'troca' AND _req.counterparty_assignment_id IS NOT NULL THEN
      UPDATE public.shift_assignments
         SET user_id = _req.from_user_id,
             original_user_id = COALESCE(original_user_id, _req.to_user_id),
             status = 'confirmado'
       WHERE id = _req.counterparty_assignment_id;
    END IF;

    UPDATE public.shift_swap_requests
       SET status = 'concluida',
           approved_by = _uid,
           admin_notes = p_notes,
           admin_responded_at = now(),
           executed_at = now()
     WHERE id = p_request_id;

    -- [LGPD] dados de producao removidos na limpeza do fork Braseg


    _recipients := ARRAY[_req.from_user_id, _req.to_user_id];
    -- [LGPD] dados de producao removidos na limpeza do fork Braseg

  ELSE
    UPDATE public.shift_assignments SET status = 'confirmado' WHERE id = _req.assignment_id;
    IF _req.counterparty_assignment_id IS NOT NULL THEN
      UPDATE public.shift_assignments SET status = 'confirmado' WHERE id = _req.counterparty_assignment_id;
    END IF;

    UPDATE public.shift_swap_requests
       SET status = 'recusada_admin',
           approved_by = _uid,
           admin_notes = p_notes,
           admin_responded_at = now()
     WHERE id = p_request_id;

    -- [LGPD] dados de producao removidos na limpeza do fork Braseg

  END IF;
END$$;

-- =========================================================
-- 9) Trigger: ao inserir na fila, dispara edge function send-swap-email
-- =========================================================
CREATE OR REPLACE FUNCTION public.trigger_swap_email_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _supabase_url text;
  _anon_key text;
BEGIN
  SELECT value INTO _supabase_url FROM public.system_settings WHERE key = 'supabase_url' AND is_active = true;
  SELECT value INTO _anon_key FROM public.system_settings WHERE key = 'supabase_anon_key' AND is_active = true;

  IF _supabase_url IS NOT NULL AND _anon_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := _supabase_url || '/functions/v1/send-swap-email',
      body := json_build_object('queue_id', NEW.id)::jsonb,
      headers := json_build_object('Authorization', 'Bearer ' || _anon_key, 'Content-Type', 'application/json')::jsonb
    );
  END IF;

  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_swap_email_queue ON public.schedule_swap_email_queue;
CREATE TRIGGER trg_swap_email_queue
AFTER INSERT ON public.schedule_swap_email_queue
FOR EACH ROW
EXECUTE FUNCTION public.trigger_swap_email_queue();

-- Permissões para as RPCs
GRANT EXECUTE ON FUNCTION public.request_shift_swap(uuid,text,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_shift_swap_request(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_shift_swap_request(uuid,boolean,text) TO authenticated;
