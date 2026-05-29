
ALTER TYPE public.tenant_role ADD VALUE IF NOT EXISTS 'consultant';
ALTER TYPE public.tenant_role ADD VALUE IF NOT EXISTS 'attendant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'consultant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'attendant';
