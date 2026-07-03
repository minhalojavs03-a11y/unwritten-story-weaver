
CREATE OR REPLACE FUNCTION public.claim_manual_lead(
  _phone text,
  _name text DEFAULT NULL,
  _email text DEFAULT NULL,
  _member_id uuid DEFAULT NULL,
  _user_id uuid DEFAULT NULL
) RETURNS TABLE(lead_id uuid, action text, previous_member_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid := '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid;
  _norm text;
  _target_user uuid;
  _target_member uuid := _member_id;
  _existing record;
  _has_msgs boolean;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  _norm := public.normalize_phone(_phone);
  IF _norm IS NULL OR length(_norm) < 8 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  -- Resolve alvo (quem está subindo): prioriza parâmetros, cai para o próprio usuário
  _target_user := COALESCE(_user_id, _uid);
  IF _target_member IS NULL THEN
    SELECT id INTO _target_member
    FROM public.tenant_members
    WHERE tenant_id = _tenant AND user_id = _target_user AND is_active = true
    ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Procura lead existente com mesmo telefone normalizado no tenant
  SELECT l.id, l.assigned_member_id, l.assigned_to, l.stage, l.name, l.email
    INTO _existing
  FROM public.leads l
  WHERE l.tenant_id = _tenant
    AND public.normalize_phone(l.phone) = _norm
  ORDER BY l.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Já pertence ao mesmo consultor? Apenas retorna.
    IF _existing.assigned_member_id IS NOT NULL AND _existing.assigned_member_id = _target_member THEN
      RETURN QUERY SELECT _existing.id, 'already_yours'::text, _existing.assigned_member_id;
      RETURN;
    END IF;

    -- Verifica se há conversas/mensagens
    SELECT EXISTS (
      SELECT 1 FROM public.messages m WHERE m.lead_id = _existing.id
      UNION ALL
      SELECT 1 FROM public.conversations c WHERE c.lead_id = _existing.id
    ) INTO _has_msgs;

    IF _existing.assigned_member_id IS NOT NULL AND _has_msgs THEN
      RAISE EXCEPTION 'already_in_service_by_other'
        USING HINT = COALESCE(_existing.assigned_member_id::text, '');
    END IF;

    -- Sem conversas (ou órfão): transfere para quem está subindo agora
    UPDATE public.leads
       SET assigned_member_id = _target_member,
           assigned_to = _target_user,
           assigned_member_at = now(),
           name = COALESCE(NULLIF(_name,''), name),
           email = COALESCE(NULLIF(_email,''), email),
           source = COALESCE(source, 'manual'),
           updated_at = now()
     WHERE id = _existing.id;

    RETURN QUERY SELECT _existing.id, 'reassigned'::text, _existing.assigned_member_id;
    RETURN;
  END IF;

  -- Não existe: cria novo já atribuído
  INSERT INTO public.leads (tenant_id, phone, name, email, stage, source, assigned_member_id, assigned_to, assigned_member_at)
  VALUES (_tenant, _phone, NULLIF(_name,''), NULLIF(_email,''), 'novo', 'manual', _target_member, _target_user, now())
  RETURNING id INTO _new_id;

  RETURN QUERY SELECT _new_id, 'created'::text, NULL::uuid;
END $$;

GRANT EXECUTE ON FUNCTION public.claim_manual_lead(text, text, text, uuid, uuid) TO authenticated;
