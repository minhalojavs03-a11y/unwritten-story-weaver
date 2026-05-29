DO $$
DECLARE
  t_id uuid := '09e13ec1-0db1-4b38-8993-61a76bd6d419';
  u_id uuid := '88eabb22-3dc9-446e-bfc9-a518ec857d50';
  l_id uuid;
  c_id uuid;
  leads_data jsonb := '[
    {"name":"Ana Carolina Silva","phone":"+5511988770001","stage":"novo","temp":"hot","src":"Instagram","msg":"Oi! Vi o anúncio dos óculos de sol, tem disponível?"},
    {"name":"Bruno Oliveira","phone":"+5511988770002","stage":"novo","temp":"warm","src":"Google","msg":"Bom dia, vocês fazem exame de vista?"},
    {"name":"Camila Ferreira","phone":"+5511988770003","stage":"qualificado","temp":"hot","src":"Indicação","msg":"Quero agendar pra essa semana se possível"},
    {"name":"Diego Martins","phone":"+5511988770004","stage":"qualificado","temp":"warm","src":"Facebook","msg":"Quanto fica a armação Ray-Ban?"},
    {"name":"Eduarda Lima","phone":"+5511988770005","stage":"agendado","temp":"hot","src":"WhatsApp","msg":"Confirmado! Estarei aí amanhã às 14h"},
    {"name":"Felipe Souza","phone":"+5511988770006","stage":"agendado","temp":"warm","src":"Google","msg":"Posso remarcar para sexta?"},
    {"name":"Gabriela Costa","phone":"+5511988770007","stage":"compareceu","temp":"hot","src":"Instagram","msg":"Adorei o atendimento! Vou pensar nas opções"},
    {"name":"Henrique Alves","phone":"+5511988770008","stage":"comprou","temp":"hot","src":"Indicação","msg":"Chegaram os óculos? Ansioso!"},
    {"name":"Isabela Rocha","phone":"+5511988770009","stage":"comprou","temp":"warm","src":"Loja","msg":"Obrigada! Ficou perfeito"},
    {"name":"João Pedro Dias","phone":"+5511988770010","stage":"perdido","temp":"cold","src":"Google","msg":"Achei caro, vou procurar outras opções"},
    {"name":"Karina Mendes","phone":"+5511988770011","stage":"novo","temp":"warm","src":"TikTok","msg":"Vocês têm lente de contato colorida?"},
    {"name":"Lucas Pereira","phone":"+5511988770012","stage":"qualificado","temp":"hot","src":"Instagram","msg":"Quero ver os modelos esportivos"}
  ]'::jsonb;
  item jsonb;
  i int := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(leads_data) LOOP
    i := i + 1;
    INSERT INTO public.leads (tenant_id, name, phone, temperature, stage, source, last_interaction_at, last_message_at, assigned_to)
    VALUES (
      t_id, item->>'name', item->>'phone',
      (item->>'temp')::lead_temperature, (item->>'stage')::lead_stage, item->>'src',
      now() - (i || ' hours')::interval, now() - (i || ' hours')::interval, u_id
    ) RETURNING id INTO l_id;

    INSERT INTO public.conversations (tenant_id, lead_id, status, last_message_at, last_message_preview, unread_count)
    VALUES (t_id, l_id, 'open', now() - (i || ' hours')::interval, item->>'msg', CASE WHEN i % 3 = 0 THEN 2 ELSE 0 END)
    RETURNING id INTO c_id;

    INSERT INTO public.messages (tenant_id, conversation_id, lead_id, direction, body, status, created_at) VALUES
      (t_id, c_id, l_id, 'inbound', item->>'msg', 'sent', now() - (i || ' hours')::interval - interval '5 min'),
      (t_id, c_id, l_id, 'outbound', 'Olá ' || split_part(item->>'name',' ',1) || '! Tudo bem? Posso te ajudar 😊', 'sent', now() - (i || ' hours')::interval - interval '3 min'),
      (t_id, c_id, l_id, 'inbound', 'Sim, obrigado(a)!', 'sent', now() - (i || ' hours')::interval - interval '1 min');

    IF item->>'stage' IN ('agendado','compareceu','comprou') THEN
      INSERT INTO public.appointments (tenant_id, lead_id, scheduled_at, status, type, duration_minutes, created_by, notes)
      VALUES (
        t_id, l_id,
        CASE item->>'stage'
          WHEN 'agendado' THEN now() + (i || ' hours')::interval
          WHEN 'compareceu' THEN now() - (i || ' days')::interval
          ELSE now() - ((i+5) || ' days')::interval
        END,
        'compareceu'::appointment_status,
        'consulta', 30, u_id, 'Exame de vista'
      );
    END IF;
  END LOOP;

  INSERT INTO public.products (tenant_id, name, brand, category, price, stock) VALUES
    (t_id, 'Aviador Clássico', 'Ray-Ban', 'Óculos de Sol', 890.00, 12),
    (t_id, 'Wayfarer Preto', 'Ray-Ban', 'Óculos de Sol', 750.00, 8),
    (t_id, 'Armação Titanium', 'Oakley', 'Armação', 1200.00, 5),
    (t_id, 'Lente Multifocal', 'Essilor', 'Lentes', 650.00, 50),
    (t_id, 'Óculos Infantil Flex', 'Nano Vista', 'Infantil', 420.00, 15),
    (t_id, 'Lente de Contato Mensal', 'Acuvue', 'Lentes de Contato', 180.00, 100);

  INSERT INTO public.templates (tenant_id, title, body, category, is_global) VALUES
    (t_id, 'Boas-vindas', 'Olá {{nome}}! Bem-vindo(a) à nossa ótica 😊 Como posso ajudar?', 'saudacao', false),
    (t_id, 'Confirmação de agendamento', 'Oi {{nome}}, confirmando seu horário {{data}} às {{hora}}. Te esperamos!', 'agendamento', false),
    (t_id, 'Lembrete D-1', 'Olá {{nome}}! Lembrete: seu exame é amanhã às {{hora}}. Confirma presença?', 'lembrete', false);
END $$;