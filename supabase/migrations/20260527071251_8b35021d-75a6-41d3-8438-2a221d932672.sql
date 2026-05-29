CREATE TABLE public.coaching_message_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  message_id uuid NOT NULL,
  conversation_id uuid,
  status text NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'error')),
  inserted_count integer NOT NULL DEFAULT 0,
  clean_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_message text,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id)
);

CREATE INDEX idx_coaching_message_analysis_tenant_analyzed
ON public.coaching_message_analysis (tenant_id, analyzed_at DESC);

GRANT SELECT ON public.coaching_message_analysis TO authenticated;
GRANT ALL ON public.coaching_message_analysis TO service_role;

ALTER TABLE public.coaching_message_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members_view_coaching_analysis_markers"
ON public.coaching_message_analysis
FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);