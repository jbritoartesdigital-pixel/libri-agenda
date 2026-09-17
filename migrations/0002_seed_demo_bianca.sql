-- Dados de DEMONSTRAÇÃO/CONFIGURAÇÃO inicial. Não contém pacientes reais.
INSERT OR IGNORE INTO professionals (
  id, name, specialty, primary_color, secondary_color, accent_color,
  online_platform, address
) VALUES (
  'bianca', 'Dra. Bianca', 'Psiquiatria', '#6f8278', '#d8e0dc', '#b88968',
  'Google Meet', 'Edifício Brasil 21 · SHS Quadra 6, Bloco A, sala 606 · Brasília/DF'
);

INSERT OR IGNORE INTO professional_pricing
(id, professional_id, appointment_type, modality, amount_cents, duration_minutes, interval_minutes)
VALUES
('bianca-first-online', 'bianca', 'primeira_consulta', 'online', 40000, 50, 0),
('bianca-first-presencial', 'bianca', 'primeira_consulta', 'presencial', 50000, 50, 0),
('bianca-return-online', 'bianca', 'retorno', 'online', 35000, 50, 0),
('bianca-return-presencial', 'bianca', 'retorno', 'presencial', 45000, 50, 0);

INSERT OR IGNORE INTO message_templates
(id, professional_id, template_key, title, body)
VALUES
(
  'bianca-msg-first-contact', 'bianca', 'primeiro_contato', 'Primeiro contato',
  'Olá! Tudo bem? 🤍\nEu sou a Julianna e cuido dos agendamentos da Dra. Bianca.\n\nFico feliz que tenha entrado em contato. Vou te ajudar com as informações e com o agendamento.\n\nVocê gostaria de atendimento online ou presencial?'
);
