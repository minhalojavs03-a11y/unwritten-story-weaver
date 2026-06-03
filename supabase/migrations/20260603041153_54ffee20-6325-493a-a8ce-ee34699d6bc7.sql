
-- Faixa de carta de crédito por consultor: usa o existente max_credit_value como teto
-- e adiciona min_credit_value como piso. Ambos opcionais (NULL = sem limite naquele lado).
ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS min_credit_value numeric DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_members_credit_range
  ON public.tenant_members (tenant_id, is_active, receives_leads, min_credit_value, max_credit_value);

-- Função SECURITY DEFINER para owner/superadmin atualizarem as configs de distribuição
-- de qualquer membro do tenant. Bloqueia supervisor/consultor explicitamente.
CREATE OR REPLACE FUNCTION public.update_member_distribution(
  _member_id uuid,
  _receives_leads boolean,
  _min_credit_value numeric,
  _max_credit_value numeric,
  _daily_lead_limit integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_role tenant_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.tenant_members WHERE id = _member_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'member not found'; END IF;

  v_role := public.get_tenant_role(auth.uid(), v_tenant);
  IF NOT public.has_app_role(auth.uid(), 'superadmin'::app_role)
     AND v_role <> 'owner'::tenant_role THEN
    RAISE EXCEPTION 'forbidden: only owner or superadmin can edit distribution';
  END IF;

  IF _min_credit_value IS NOT NULL AND _max_credit_value IS NOT NULL
     AND _min_credit_value > _max_credit_value THEN
    RAISE EXCEPTION 'min greater than max';
  END IF;

  UPDATE public.tenant_members
     SET receives_leads = _receives_leads,
         min_credit_value = _min_credit_value,
         max_credit_value = _max_credit_value,
         daily_lead_limit = _daily_lead_limit,
         updated_at = now()
   WHERE id = _member_id;
END $$;

GRANT EXECUTE ON FUNCTION public.update_member_distribution(uuid,boolean,numeric,numeric,integer) TO authenticated;
