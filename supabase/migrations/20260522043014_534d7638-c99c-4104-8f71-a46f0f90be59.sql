
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qualification_status text,
  ADD COLUMN IF NOT EXISTS lead_phase text,
  ADD COLUMN IF NOT EXISTS opportunity_type text,
  ADD COLUMN IF NOT EXISTS disqualification_reason text,
  ADD COLUMN IF NOT EXISTS next_followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS credit_value numeric,
  ADD COLUMN IF NOT EXISTS asset_type text;
