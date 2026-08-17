-- Fix trigger to use pg_net correctly
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _has_subs boolean;
  _supabase_url text;
  _anon_key text;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.push_subscriptions WHERE user_id = NEW.user_id
  ) INTO _has_subs;

  IF NOT _has_subs THEN
    RETURN NEW;
  END IF;

  SELECT value INTO _supabase_url FROM public.system_settings WHERE key = 'supabase_url' AND is_active = true;
  SELECT value INTO _anon_key FROM public.system_settings WHERE key = 'supabase_anon_key' AND is_active = true;

  IF _supabase_url IS NOT NULL AND _anon_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := _supabase_url || '/functions/v1/send-push',
      body := json_build_object('notification_id', NEW.id)::jsonb,
      headers := json_build_object('Authorization', 'Bearer ' || _anon_key, 'Content-Type', 'application/json')::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$;