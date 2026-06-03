-- Corrigir papel do Antonio Junior: ele é Supervisor, não Owner/Consultor
-- 1) user_roles: trocar 'owner' por 'supervisor' (permissões da role supervisor)
DELETE FROM public.user_roles
 WHERE user_id = '54705a9d-9ee2-4e06-b612-e090ab982edb'
   AND role = 'owner';

INSERT INTO public.user_roles (user_id, role)
VALUES ('54705a9d-9ee2-4e06-b612-e090ab982edb', 'supervisor')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2) Garantir role_label e display consistentes
UPDATE public.profiles
   SET role_label = 'Supervisor'
 WHERE id = '54705a9d-9ee2-4e06-b612-e090ab982edb';

-- 3) Garantir membership no próprio tenant como supervisor
UPDATE public.tenant_memberships
   SET role = 'supervisor'
 WHERE user_id = '54705a9d-9ee2-4e06-b612-e090ab982edb';

-- 4) WhatsApp do Antonio estava registrado no tenant 'Feracon' (9ecb99e2...),
--    mas pela arquitetura cada usuário tem seu PRÓPRIO tenant isolado.
--    Mover a instância para o tenant do Antonio (8b24cfb1...).
UPDATE public.whatsapp_instances
   SET tenant_id = '8b24cfb1-1dd5-463a-934e-56c6efa91d88'
 WHERE seller_user_id = '54705a9d-9ee2-4e06-b612-e090ab982edb'
   AND tenant_id <> '8b24cfb1-1dd5-463a-934e-56c6efa91d88';