-- Transferir leads cujo único atendimento foi feito pelo número da empresa (804)
-- por estarem com consultor desconectado no WhatsApp.
WITH lead_804 AS (
  SELECT DISTINCT lead_id FROM messages
  WHERE whatsapp_instance_id = '46928de5-7b68-43b1-8913-f0a1ceea44c1'
    AND direction='outbound' AND lead_id IS NOT NULL
),
lead_other_out AS (
  SELECT DISTINCT lead_id FROM messages
  WHERE direction='outbound' AND whatsapp_instance_id IS NOT NULL
    AND whatsapp_instance_id <> '46928de5-7b68-43b1-8913-f0a1ceea44c1'
    AND lead_id IS NOT NULL
),
to_move AS (
  SELECT l.id
  FROM leads l
  JOIN lead_804 a ON a.lead_id = l.id
  WHERE NOT EXISTS (SELECT 1 FROM lead_other_out b WHERE b.lead_id = l.id)
    AND (l.assigned_member_id IS DISTINCT FROM 'a1f959f9-8318-42c6-a843-6804fddef7c0')
)
UPDATE leads
SET assigned_member_id = 'a1f959f9-8318-42c6-a843-6804fddef7c0',
    whatsapp_instance_id = '46928de5-7b68-43b1-8913-f0a1ceea44c1',
    updated_at = now()
WHERE id IN (SELECT id FROM to_move);

-- Atualiza também as conversas para refletir a instância 804
UPDATE conversations c
SET whatsapp_instance_id = '46928de5-7b68-43b1-8913-f0a1ceea44c1'
WHERE c.lead_id IN (
  SELECT l.id FROM leads l
  WHERE l.assigned_member_id = 'a1f959f9-8318-42c6-a843-6804fddef7c0'
    AND l.whatsapp_instance_id = '46928de5-7b68-43b1-8913-f0a1ceea44c1'
);