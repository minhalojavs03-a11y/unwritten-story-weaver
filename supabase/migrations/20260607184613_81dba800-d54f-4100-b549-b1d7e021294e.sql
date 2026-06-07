DROP TRIGGER IF EXISTS trg_auto_assign_new_lead ON public.leads;
CREATE TRIGGER trg_auto_assign_new_lead
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_new_lead();

DROP TRIGGER IF EXISTS zzz_sync_lead_assigned_user ON public.leads;
DROP TRIGGER IF EXISTS trg_sync_lead_assigned_user ON public.leads;
CREATE TRIGGER zzz_sync_lead_assigned_user
BEFORE INSERT OR UPDATE OF assigned_member_id, assigned_to, tenant_id ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.sync_lead_assigned_user();