
CREATE TABLE public.menu_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('owner','supervisor','consultant')),
  menu_key text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, menu_key)
);

GRANT SELECT ON public.menu_permissions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_permissions TO authenticated;
GRANT ALL ON public.menu_permissions TO service_role;

ALTER TABLE public.menu_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_permissions_select_all"
  ON public.menu_permissions FOR SELECT
  USING (true);

CREATE POLICY "menu_permissions_superadmin_write"
  ON public.menu_permissions FOR ALL
  TO authenticated
  USING (public.has_app_role(auth.uid(), 'superadmin'::public.app_role))
  WITH CHECK (public.has_app_role(auth.uid(), 'superadmin'::public.app_role));

CREATE TRIGGER update_menu_permissions_updated_at
  BEFORE UPDATE ON public.menu_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
