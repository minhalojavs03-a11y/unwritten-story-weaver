
ALTER TABLE public.sheet_sync_config 
  ADD COLUMN IF NOT EXISTS source_label TEXT NOT NULL DEFAULT 'Leads 01';

UPDATE public.sheet_sync_config SET source_label = 'Leads 01' WHERE source_label IS NULL OR source_label = '';

INSERT INTO public.sheet_sync_config (
  tenant_id, sheet_url, sheet_id, tab_name, header_row, column_mapping,
  is_active, distribution_tenant_ids, source_label
) VALUES (
  '9ecb99e2-50ee-404f-920b-81cd94cc685e',
  'https://docs.google.com/spreadsheets/d/1kzZswK6TnxWAiCNSbKlnxwb2saQNfrOwLHU2RD_YS8c/edit?usp=sharing',
  '1kzZswK6TnxWAiCNSbKlnxwb2saQNfrOwLHU2RD_YS8c',
  'Página1',
  1,
  '{"nome":"N","telefone":"O","interesse":"M"}'::jsonb,
  true,
  ARRAY['9ecb99e2-50ee-404f-920b-81cd94cc685e']::uuid[],
  'Leads 02'
)
ON CONFLICT DO NOTHING;
