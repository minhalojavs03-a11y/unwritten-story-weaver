CREATE OR REPLACE FUNCTION public.set_ai_pre_attendance(_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = auth.uid();
  IF _tenant IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;

  INSERT INTO public.ai_config (tenant_id, enabled, is_active)
  VALUES (_tenant, _enabled, _enabled)
  ON CONFLICT (tenant_id) DO UPDATE
  SET enabled = EXCLUDED.enabled,
      is_active = EXCLUDED.is_active,
      updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ai_pre_attendance(boolean) TO authenticated;