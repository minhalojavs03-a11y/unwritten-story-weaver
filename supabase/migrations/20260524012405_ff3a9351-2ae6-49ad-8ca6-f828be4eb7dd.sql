
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('welcome','consultant_tier_match')),
  due_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','error','skipped')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_queue_due_idx
  ON public.notification_queue (status, type, due_at);

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view notification_queue" ON public.notification_queue;
CREATE POLICY "Staff view notification_queue" ON public.notification_queue
  FOR SELECT TO authenticated USING (is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS "Superadmins manage notification_queue" ON public.notification_queue;
CREATE POLICY "Superadmins manage notification_queue" ON public.notification_queue
  FOR ALL TO authenticated USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));
