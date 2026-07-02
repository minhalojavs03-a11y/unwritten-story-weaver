CREATE OR REPLACE FUNCTION public.is_lead_source(_imported_from_sheet boolean, _source text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT coalesce(_imported_from_sheet, false)
      OR lower(coalesce(_source,'')) IN (
        'ads','campaign','excel','sheet','planilha','anuncio','anúncio',
        'meta','facebook','instagram','google','google_ads','meta_ads',
        'tiktok','tiktok_ads','linkedin','linkedin_ads',
        'nilton_sheet_overflow','nilton_overflow'
      );
$function$;