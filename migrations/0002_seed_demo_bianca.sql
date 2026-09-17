-- Este seed é apenas referência para uma instalação nova.
-- O banco de produção atual já recebeu a Dra. Bianca manualmente pelo Console do D1.

INSERT INTO professionals (
  name, specialty, online_enabled, in_person_enabled, online_platform,
  clinic_name, clinic_address, first_online_price, first_in_person_price,
  followup_online_price, followup_in_person_price,
  first_appointment_duration, followup_appointment_duration, interval_minutes, invoice_mode
)
SELECT
  'Dra. Bianca', 'Psiquiatria', 1, 1, 'Google Meet',
  'Edifício Brasil 21', 'SHS Quadra 6, Bloco A, sala 606, Brasília - DF, 70316-102',
  400.00, 500.00, 350.00, 450.00, 50, 50, 0, 'on_request'
WHERE NOT EXISTS (SELECT 1 FROM professionals WHERE name = 'Dra. Bianca');
