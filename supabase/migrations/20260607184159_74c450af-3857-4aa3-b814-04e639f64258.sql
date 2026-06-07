DROP TRIGGER IF EXISTS trg_sync_lead_assigned_user ON public.leads;
CREATE TRIGGER trg_sync_lead_assigned_user
BEFORE INSERT OR UPDATE OF assigned_member_id, assigned_to, tenant_id ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.sync_lead_assigned_user();