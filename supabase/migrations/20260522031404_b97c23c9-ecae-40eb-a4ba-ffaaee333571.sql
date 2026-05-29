-- Backfill: para cada lead sem nome com telefone, copiar nome/email/interesse
-- de outro lead do MESMO tenant com o mesmo telefone (geralmente vindo da planilha).
WITH pairs AS (
  SELECT DISTINCT ON (l1.id) l1.id AS empty_id, l2.name, l2.email, l2.interest
  FROM public.leads l1
  JOIN public.leads l2
    ON l1.tenant_id = l2.tenant_id
   AND l1.id <> l2.id
   AND regexp_replace(coalesce(l1.phone,''), '\D', '', 'g') =
       regexp_replace(coalesce(l2.phone,''), '\D', '', 'g')
   AND regexp_replace(coalesce(l1.phone,''), '\D', '', 'g') <> ''
  WHERE (l1.name IS NULL OR l1.name = '')
    AND l2.name IS NOT NULL AND l2.name <> ''
  ORDER BY l1.id, l2.created_at ASC
)
UPDATE public.leads l
SET name = COALESCE(l.name, p.name),
    email = COALESCE(l.email, p.email),
    interest = COALESCE(l.interest, p.interest),
    updated_at = now()
FROM pairs p
WHERE l.id = p.empty_id;