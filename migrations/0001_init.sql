PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS professionals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  specialty TEXT,
  professional_registry TEXT,
  photo_url TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#6B7280',
  secondary_color TEXT DEFAULT '#F3F4F6',
  accent_color TEXT DEFAULT '#111827',
  theme_mode TEXT DEFAULT 'light' CHECK (theme_mode IN ('light', 'dark')),
  active INTEGER NOT NULL DEFAULT 1,
  online_enabled INTEGER NOT NULL DEFAULT 1,
  in_person_enabled INTEGER NOT NULL DEFAULT 1,
  online_platform TEXT,
  online_link TEXT,
  clinic_name TEXT,
  clinic_address TEXT,
  first_online_price REAL,
  first_in_person_price REAL,
  followup_online_price REAL,
  followup_in_person_price REAL,
  first_appointment_duration INTEGER DEFAULT 50,
  followup_appointment_duration INTEGER DEFAULT 50,
  interval_minutes INTEGER DEFAULT 0,
  pix_key TEXT,
  pix_holder TEXT,
  payment_instructions TEXT,
  invoice_mode TEXT DEFAULT 'on_request' CHECK (invoice_mode IN ('always', 'on_request')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'professional')),
  professional_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  professional_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT,
  preferred_modality TEXT CHECK (preferred_modality IS NULL OR preferred_modality IN ('online', 'in_person')),
  birth_date TEXT,
  administrative_notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS patient_fiscal_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL UNIQUE,
  cpf TEXT,
  invoice_email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedule_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  professional_id INTEGER NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  modality TEXT DEFAULT 'both' CHECK (modality IN ('online', 'in_person', 'both')),
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  professional_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  block_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_weekday INTEGER CHECK (recurrence_weekday IS NULL OR recurrence_weekday BETWEEN 0 AND 6),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  professional_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL,
  appointment_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  appointment_type TEXT NOT NULL CHECK (appointment_type IN ('first', 'followup')),
  modality TEXT NOT NULL CHECK (modality IN ('online', 'in_person')),
  status TEXT NOT NULL DEFAULT 'awaiting_confirmation' CHECK (status IN ('reserved', 'awaiting_confirmation', 'confirmed', 'completed', 'cancelled', 'no_show')),
  duration_minutes INTEGER NOT NULL DEFAULT 50,
  price REAL,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'exempt')),
  invoice_status TEXT NOT NULL DEFAULT 'not_requested' CHECK (invoice_status IN ('not_requested', 'awaiting_data', 'ready', 'issued')),
  administrative_notes TEXT,
  original_appointment_id INTEGER,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (original_appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL UNIQUE,
  invoice_number TEXT,
  issued_at TEXT,
  file_name TEXT,
  file_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  professional_id INTEGER NOT NULL,
  template_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (professional_id, template_key),
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  professional_id INTEGER,
  user_id INTEGER,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_patients_professional ON patients(professional_id);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name);
CREATE INDEX IF NOT EXISTS idx_appointments_professional_date ON appointments(professional_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_professional_date ON schedule_blocks(professional_id, block_date);
CREATE INDEX IF NOT EXISTS idx_schedule_rules_professional ON schedule_rules(professional_id);
CREATE INDEX IF NOT EXISTS idx_messages_professional ON message_templates(professional_id);
