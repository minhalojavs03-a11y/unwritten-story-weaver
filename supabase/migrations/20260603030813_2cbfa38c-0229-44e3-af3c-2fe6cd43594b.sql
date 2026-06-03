-- =====================================================================
-- Etapa 1: Classificação lead vs outros (ordem corrigida)
-- =====================================================================

-- 1. Funções auxiliares (criadas primeiro pois índices/constraints podem usá-las)

CREATE OR REPLACE FUNCTION public.normalize_phone(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _phone IS NULL THEN NULL
    ELSE NULLIF(
      regexp_replace(
        regexp_replace(
          regexp_replace(_phone, '[^0-9]', '', 'g'),
          '^0+', ''
        ),
        '^55', ''
      ),
      ''
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.is_lead_source(_imported_from_sheet boolean, _source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(_imported_from_sheet, false)
      OR lower(coalesce(_source,'')) IN (
        'ads','campaign','excel','sheet','planilha','anuncio','anúncio',
        'meta','facebook','instagram','google','google_ads','meta_ads',
        'tiktok','tiktok_ads','linkedin','linkedin_ads'
      );
$$;

CREATE OR REPLACE FUNCTION public.classify_lead_kind(_tenant uuid, _phone text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _phone IS NULL OR public.normalize_phone(_phone) IS NULL THEN 'outros'
    WHEN EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.tenant_id = _tenant
         AND public.is_lead_source(l.imported_from_sheet, l.source)
         AND public.normalize_phone(l.phone) = public.normalize_phone(_phone)
    ) THEN 'lead'
    ELSE 'outros'
  END
$$;

-- 2. Coluna kind + constraint + índices
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'lead';

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_kind_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_kind_check CHECK (kind IN ('lead','outros'));

CREATE INDEX IF NOT EXISTS idx_leads_tenant_kind
  ON public.leads(tenant_id, kind);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_phone_norm
  ON public.leads(tenant_id, (public.normalize_phone(phone)))
  WHERE phone IS NOT NULL;

-- 3. Backfill retroativo
UPDATE public.leads l
   SET kind = 'lead'
 WHERE public.is_lead_source(l.imported_from_sheet, l.source)
   AND l.kind <> 'lead';

UPDATE public.leads l
   SET kind = 'outros'
 WHERE NOT public.is_lead_source(l.imported_from_sheet, l.source)
   AND NOT EXISTS (
     SELECT 1 FROM public.leads s
      WHERE s.tenant_id = l.tenant_id
        AND public.is_lead_source(s.imported_from_sheet, s.source)
        AND public.normalize_phone(s.phone) = public.normalize_phone(l.phone)
   )
   AND l.kind <> 'outros';

-- 4. Trigger BEFORE INSERT: auto-classifica se app não definir
CREATE OR REPLACE FUNCTION public.set_lead_kind_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_lead_source(NEW.imported_from_sheet, NEW.source) THEN
    NEW.kind := 'lead';
  ELSIF NEW.kind IS NULL OR NEW.kind = 'lead' THEN
    NEW.kind := public.classify_lead_kind(NEW.tenant_id, NEW.phone);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_lead_kind ON public.leads;
CREATE TRIGGER trg_set_lead_kind
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_kind_on_insert();

-- 5. Trigger AFTER INSERT/UPDATE: promove "outros" quando uma fonte oficial chega
CREATE OR REPLACE FUNCTION public.promote_matching_outros()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_lead_source(NEW.imported_from_sheet, NEW.source)
     AND NEW.phone IS NOT NULL
     AND public.normalize_phone(NEW.phone) IS NOT NULL
  THEN
    UPDATE public.leads
       SET kind = 'lead',
           updated_at = now()
     WHERE tenant_id = NEW.tenant_id
       AND id <> NEW.id
       AND kind = 'outros'
       AND public.normalize_phone(phone) = public.normalize_phone(NEW.phone);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_promote_matching_outros ON public.leads;
CREATE TRIGGER trg_promote_matching_outros
AFTER INSERT OR UPDATE OF imported_from_sheet, source, phone
ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.promote_matching_outros();

-- 6. Função utilitária para reclassificação manual
CREATE OR REPLACE FUNCTION public.reclassify_leads(_tenant uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH upd AS (
    UPDATE public.leads l
       SET kind = public.classify_lead_kind(l.tenant_id, l.phone),
           updated_at = now()
     WHERE (_tenant IS NULL OR l.tenant_id = _tenant)
       AND NOT public.is_lead_source(l.imported_from_sheet, l.source)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END $$;