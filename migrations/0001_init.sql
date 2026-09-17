PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS professionals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#6f8278',
  secondary_color TEXT NOT NULL DEFAULT '#d8e0dc',
  accent_color TEXT NOT NULL DEFAULT '#b88968',
  online_platform TEXT,
  online_link TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'professional')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS professional_users (
  professional_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (professional_id, user_id),
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  professional_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT,
  birth_date TEXT,
  preferred_modality TEXT CHECK (preferred_modality IN ('online', 'presencial') OR preferred_modality IS NULL),
  admin_notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_patients_professional ON patients(professional_id, archived, full_name);

CREATE TABLE IF NOT EXISTS patient_tax_data (
  patient_id TEXT PRIMARY KEY,
  cpf TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  invoice_email TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  professional_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  appointment_type TEXT NOT NULL CHECK (appointment_type IN ('primeira_consulta', 'retorno', 'outro')),
  modality TEXT NOT NULL CHECK (modality IN ('online', 'presencial')),
  status TEXT NOT NULL CHECK (status IN ('reservado', 'aguardando_confirmacao', 'confirmado', 'realizado', 'cancelado', 'faltou')),
  amount_cents INTEGER,
  payment_status TEXT NOT NULL DEFAULT 'pendente' CHECK (payment_status IN ('pendente', 'pago', 'isento')),
  invoice_status TEXT NOT NULL DEFAULT 'nao_solicitada' CHECK (invoice_status IN ('nao_solicitada', 'aguardando_dados', 'pronta', 'emitida')),
  admin_notes TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_professional_date ON appointments(professional_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id TEXT PRIMARY KEY,
  professional_id TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  recurrence_rule TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_professional_date ON schedule_blocks(professional_id, starts_at);

CREATE TABLE IF NOT EXISTS availability_rules (
  id TEXT PRIMARY KEY,
  professional_id TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  modality TEXT CHECK (modality IN ('online', 'presencial') OR modality IS NULL),
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS professional_pricing (
  id TEXT PRIMARY KEY,
  professional_id TEXT NOT NULL,
  appointment_type TEXT NOT NULL CHECK (appointment_type IN ('primeira_consulta', 'retorno', 'outro')),
  modality TEXT NOT NULL CHECK (modality IN ('online', 'presencial')),
  amount_cents INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 50,
  interval_minutes INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_unique
  ON professional_pricing(professional_id, appointment_type, modality);

CREATE TABLE IF NOT EXISTS message_templates (
  id TEXT PRIMARY KEY,
  professional_id TEXT NOT NULL,
  template_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_template_key
  ON message_templates(professional_id, template_key);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL UNIQUE,
  invoice_number TEXT,
  issued_at TEXT,
  file_key TEXT,
  file_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  professional_id TEXT,
  user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
