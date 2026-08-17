CREATE TABLE public.ai_daily_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  summary_date date NOT NULL,
  summary_text text NOT NULL,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid,
  UNIQUE (company_id, summary_date)
);

CREATE INDEX idx_ai_daily_summaries_company_date ON public.ai_daily_summaries(company_id, summary_date DESC);

ALTER TABLE public.ai_daily_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view summaries for their companies"
  ON public.ai_daily_summaries FOR SELECT
  TO authenticated
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Service role can manage summaries"
  ON public.ai_daily_summaries FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can insert summaries for their companies"
  ON public.ai_daily_summaries FOR INSERT
  TO authenticated
  WITH CHECK (has_company_access(auth.uid(), company_id));

CREATE POLICY "Authenticated users can update summaries for their companies"
  ON public.ai_daily_summaries FOR UPDATE
  TO authenticated
  USING (has_company_access(auth.uid(), company_id));