ALTER TABLE public.tenant_members 
ADD COLUMN IF NOT EXISTS followup_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS followup_daily_limit INTEGER DEFAULT 5 CHECK (followup_daily_limit >= 1 AND followup_daily_limit <= 10);

-- Refresh the view if it exists (some projects use views for distribution lists)
-- Assuming list_distribution_consultants is a function or rpc, we don't need to refresh a view unless it's a materialized view.
