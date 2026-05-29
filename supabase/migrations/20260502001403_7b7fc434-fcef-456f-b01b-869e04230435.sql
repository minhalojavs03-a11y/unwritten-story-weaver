
-- ============================================
-- DEMO DATA — Ótica Catelan
-- Tag: notes começam com '[DEMO]' para fácil remoção
-- ============================================

DO $$
DECLARE
  t_id uuid := '97bdb855-6e7b-4091-81a3-463797393254';
  l1 uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; l6 uuid; l7 uuid; l8 uuid;
  l9 uuid; l10 uuid; l11 uuid; l12 uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid;
BEGIN

-- =================== LEADS ===================
INSERT INTO leads (id, tenant_id, name, phone, email, temperature, stage, source, notes, tags, last_message_at, last_interaction_at)
VALUES
  (gen_random_uuid(), t_id, 'Maria Eduarda Silva', '+5544991234501', 'maria.silva@gmail.com', 'hot', 'qualificado', 'Instagram', '[DEMO] Interessada em óculos de grau Ray-Ban. Já fez consulta no oftalmo.', ARRAY['ray-ban','grau'], now() - interval '8 minutes', now() - interval '8 minutes') RETURNING id INTO l1;
INSERT INTO leads (id, tenant_id, name, phone, email, temperature, stage, source, notes, tags, last_message_at, last_interaction_at)
VALUES (gen_random_uuid(), t_id, 'João Pedro Almeida', '+5544991234502', 'joaop.almeida@hotmail.com', 'hot', 'novo', 'WhatsApp', '[DEMO] Quer óculos solar polarizado urgente para viagem.', ARRAY['solar','urgente'], now() - interval '23 minutes', now() - interval '23 minutes') RETURNING id INTO l2;
INSERT INTO leads (id, tenant_id, name, phone, email, temperature, stage, source, notes, tags, last_message_at, last_interaction_at)
VALUES (gen_random_uuid(), t_id, 'Ana Beatriz Costa', '+5544991234503', 'anabea.costa@gmail.com', 'hot', 'agendado', 'Indicação', '[DEMO] Vai trazer receita do oftalmologista. Cliente recorrente.', ARRAY['vip','recorrente'], now() - interval '1 hour', now() - interval '1 hour') RETURNING id INTO l3;
INSERT INTO leads (id, tenant_id, name, phone, email, temperature, stage, source, notes, tags, last_message_at, last_interaction_at)
VALUES (gen_random_uuid(), t_id, 'Rafael Mendes', '+5544991234504', 'rafa.mendes@outlook.com', 'warm', 'qualificado', 'Google', '[DEMO] Comparando preços de lentes multifocais.', ARRAY['multifocal'], now() - interval '3 hours', now() - interval '3 hours') RETURNING id INTO l4;
INSERT INTO leads (id, tenant_id, name, phone, email, temperature, stage, source, notes, tags, last_message_at, last_interaction_at)
VALUES (gen_random_uuid(), t_id, 'Camila Rodrigues', '+5544991234505', 'camila.rod@gmail.com', 'warm', 'novo', 'Facebook', '[DEMO] Pediu catálogo de armações femininas.', ARRAY['feminino','catalogo'], now() - interval '5 hours', now() - interval '5 hours') RETURNING id INTO l5;
INSERT INTO leads (id, tenant_id, name, phone, email, temperature, stage, source, notes, tags, last_message_at, last_interaction_at)
VALUES (gen_random_uuid(), t_id, 'Lucas Ferreira', '+5544991234506', 'lucas.ferreira@gmail.com', 'warm', 'agendado', 'Instagram', '[DEMO] Vai fazer exame de vista.', ARRAY['exame'], now() - interval '6 hours', now() - interval '6 hours') RETURNING id INTO l6;
INSERT INTO leads (id, tenant_id, name, phone, email, temperature, stage, source, notes, tags, last_message_at, last_interaction_at)
VALUES (gen_random_uuid(), t_id, 'Juliana Martins', '+5544991234507', 'juliana.m@gmail.com', 'warm', 'compareceu', 'WhatsApp', '[DEMO] Compareceu na consulta, decidindo armação.', ARRAY['decidindo'], now() - interval '1 day', now() - interval '1 day') RETURNING id INTO l7;
INSERT INTO leads (id, tenant_id, name, phone, email, temperature, stage, source, notes, tags, last_message_at, last_interaction_at)
VALUES (gen_random_uuid(), t_id, 'Pedro Henrique Souza', '+5544991234508', 'pedrohs@gmail.com', 'cold', 'novo', 'Site', '[DEMO] Apenas pediu informações iniciais.', ARRAY['frio'], now() - interval '2 days', now() - interval '2 days') RETURNING id INTO l8;
INSERT INTO leads (id, tenant_id, name, phone, email, temperature, stage, source, notes, tags, last_message_at, last_interaction_at)
VALUES (gen_random_uuid(), t_id, 'Fernanda Lima', '+5544991234509', 'fernanda.lima@gmail.com', 'cold', 'qualificado', 'Google', '[DEMO] Pesquisando preços, sem urgência.', ARRAY['pesquisa'], now() - interval '3 days', now() - interval '3 days') RETURNING id INTO l9;
INSERT INTO leads (id, tenant_id, name, phone, email, temperature, stage, source, notes, tags, last_message_at, last_interaction_at)
VALUES (gen_random_uuid(), t_id, 'Bruno Cardoso', '+5544991234510', 'bruno.cardoso@gmail.com', 'hot', 'comprou', 'Indicação', '[DEMO] Comprou Oakley Holbrook + lentes antirreflexo. Total R$ 1.890.', ARRAY['oakley','venda-fechada'], now() - interval '4 days', now() - interval '4 days') RETURNING id INTO l10;
INSERT INTO leads (id, tenant_id, name, phone, email, temperature, stage, source, notes, tags, last_message_at, last_interaction_at)
VALUES (gen_random_uuid(), t_id, 'Larissa Oliveira', '+5544991234511', 'larissa.oli@gmail.com', 'warm', 'comprou', 'Instagram', '[DEMO] Comprou Vogue feminino + lentes transitions.', ARRAY['vogue','venda-fechada'], now() - interval '7 days', now() - interval '7 days') RETURNING id INTO l11;
INSERT INTO leads (id, tenant_id, name, phone, email, temperature, stage, source, notes, tags, last_message_at, last_interaction_at)
VALUES (gen_random_uuid(), t_id, 'Roberto Tanaka', '+5544991234512', 'r.tanaka@gmail.com', 'cold', 'perdido', 'WhatsApp', '[DEMO] Achou o preço alto, foi para concorrente.', ARRAY['perdido'], now() - interval '10 days', now() - interval '10 days') RETURNING id INTO l12;

-- =================== CONVERSATIONS ===================
INSERT INTO conversations (id, tenant_id, lead_id, status, last_message_at, last_message_preview, unread_count)
VALUES (gen_random_uuid(), t_id, l1, 'open', now() - interval '8 minutes', 'Posso passar aí amanhã às 14h?', 2) RETURNING id INTO c1;
INSERT INTO conversations (id, tenant_id, lead_id, status, last_message_at, last_message_preview, unread_count)
VALUES (gen_random_uuid(), t_id, l2, 'open', now() - interval '23 minutes', 'Vocês têm Oakley em estoque?', 1) RETURNING id INTO c2;
INSERT INTO conversations (id, tenant_id, lead_id, status, last_message_at, last_message_preview, unread_count)
VALUES (gen_random_uuid(), t_id, l3, 'open', now() - interval '1 hour', 'Confirmado, até amanhã!', 0) RETURNING id INTO c3;
INSERT INTO conversations (id, tenant_id, lead_id, status, last_message_at, last_message_preview, unread_count)
VALUES (gen_random_uuid(), t_id, l4, 'open', now() - interval '3 hours', 'Qual a diferença das lentes Zeiss?', 1) RETURNING id INTO c4;
INSERT INTO conversations (id, tenant_id, lead_id, status, last_message_at, last_message_preview, unread_count)
VALUES (gen_random_uuid(), t_id, l5, 'pending', now() - interval '5 hours', 'Catálogo enviado ✅', 0) RETURNING id INTO c5;
INSERT INTO conversations (id, tenant_id, lead_id, status, last_message_at, last_message_preview, unread_count)
VALUES (gen_random_uuid(), t_id, l10, 'closed', now() - interval '4 days', 'Obrigado pela compra! 😊', 0) RETURNING id INTO c6;

-- =================== MESSAGES ===================
INSERT INTO messages (tenant_id, conversation_id, lead_id, direction, body, status, created_at) VALUES
(t_id, c1, l1, 'inbound',  'Olá! Vi os óculos Ray-Ban no Instagram, ainda têm?', 'read', now() - interval '45 minutes'),
(t_id, c1, l1, 'outbound', 'Oi Maria! Sim, temos diversas cores disponíveis. Qual modelo te interessou?', 'read', now() - interval '40 minutes'),
(t_id, c1, l1, 'inbound',  'O Aviator dourado. Tenho receita do oftalmo, vocês fazem com grau?', 'read', now() - interval '20 minutes'),
(t_id, c1, l1, 'outbound', 'Fazemos sim! Pode trazer a receita que avaliamos as lentes ideais.', 'read', now() - interval '15 minutes'),
(t_id, c1, l1, 'inbound',  'Posso passar aí amanhã às 14h?', 'delivered', now() - interval '8 minutes'),

(t_id, c2, l2, 'inbound',  'Bom dia! Vocês têm Oakley em estoque?', 'delivered', now() - interval '23 minutes'),

(t_id, c3, l3, 'inbound',  'Oi, queria confirmar o horário de amanhã 10h', 'read', now() - interval '2 hours'),
(t_id, c3, l3, 'outbound', 'Confirmado Ana! Te esperamos às 10h. Traga sua receita.', 'read', now() - interval '90 minutes'),
(t_id, c3, l3, 'inbound',  'Confirmado, até amanhã!', 'read', now() - interval '1 hour'),

(t_id, c4, l4, 'inbound',  'Qual a diferença das lentes Zeiss para as comuns?', 'delivered', now() - interval '3 hours'),

(t_id, c5, l5, 'inbound',  'Vocês têm catálogo de armações femininas?', 'read', now() - interval '6 hours'),
(t_id, c5, l5, 'outbound', 'Catálogo enviado ✅', 'read', now() - interval '5 hours'),

(t_id, c6, l10, 'outbound', 'Bruno, seu Oakley está pronto para retirada!', 'read', now() - interval '5 days'),
(t_id, c6, l10, 'inbound',  'Passo aí ainda hoje', 'read', now() - interval '5 days'),
(t_id, c6, l10, 'outbound', 'Obrigado pela compra! 😊', 'read', now() - interval '4 days');

-- =================== APPOINTMENTS ===================
INSERT INTO appointments (tenant_id, lead_id, scheduled_at, duration_minutes, type, status, notes) VALUES
(t_id, l3, date_trunc('day', now()) + interval '10 hours', 30, 'consulta',     'confirmado', '[DEMO] Trazer receita do oftalmo'),
(t_id, l1, date_trunc('day', now()) + interval '14 hours', 30, 'consulta',     'agendado',   '[DEMO] Ray-Ban Aviator com grau'),
(t_id, l6, date_trunc('day', now()) + interval '16 hours 30 minutes', 45, 'exame', 'agendado', '[DEMO] Exame de vista completo'),
(t_id, l7, date_trunc('day', now()) - interval '14 hours', 30, 'retorno', 'compareceu', '[DEMO] Escolha de armação'),
(t_id, l4, date_trunc('day', now()) + interval '1 day' + interval '11 hours', 30, 'consulta', 'agendado', '[DEMO] Avaliação multifocal'),
(t_id, l5, date_trunc('day', now()) + interval '2 days' + interval '15 hours', 30, 'consulta', 'agendado', '[DEMO] Apresentar catálogo feminino');

-- =================== PRODUCTS ===================
INSERT INTO products (tenant_id, name, brand, category, price, stock, active) VALUES
(t_id, 'Aviator Classic Dourado', 'Ray-Ban', 'Solar', 890.00, 12, true),
(t_id, 'Wayfarer Preto',          'Ray-Ban', 'Solar', 790.00,  8, true),
(t_id, 'Holbrook Matte Black',    'Oakley',  'Solar', 1190.00, 5, true),
(t_id, 'Frogskins Polarizado',    'Oakley',  'Solar', 990.00,  6, true),
(t_id, 'VO5356 Feminino',         'Vogue',   'Grau',  590.00, 10, true),
(t_id, 'VO5430 Feminino',         'Vogue',   'Grau',  490.00, 14, true),
(t_id, 'Lente Zeiss Antirreflexo','Zeiss',   'Lente', 690.00, 50, true),
(t_id, 'Lente Multifocal Premium','Zeiss',   'Lente',1290.00, 25, true),
(t_id, 'Lente Transitions',       'Essilor', 'Lente', 890.00, 30, true),
(t_id, 'Armação Infantil Flexível','Nano',   'Grau',  390.00,  9, true);

END $$;
