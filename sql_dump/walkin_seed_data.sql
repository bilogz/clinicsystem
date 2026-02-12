-- Neon PostgreSQL seed data for Walk-In module
-- Run this in Neon SQL editor after base schema

BEGIN;

CREATE TABLE IF NOT EXISTS patient_walkins (
  id BIGSERIAL PRIMARY KEY,
  case_id VARCHAR(40) NOT NULL UNIQUE,
  patient_name VARCHAR(150) NOT NULL,
  age SMALLINT NULL,
  contact VARCHAR(80) NULL,
  chief_complaint TEXT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'Low',
  intake_time TIMESTAMP NOT NULL DEFAULT NOW(),
  assigned_doctor VARCHAR(120) NOT NULL DEFAULT 'Nurse Triage',
  status VARCHAR(30) NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_walkins_status ON patient_walkins(status);
CREATE INDEX IF NOT EXISTS idx_patient_walkins_intake ON patient_walkins(intake_time DESC);

INSERT INTO patient_walkins (case_id, patient_name, age, contact, chief_complaint, severity, intake_time, assigned_doctor, status)
VALUES
  ('WALK-2026-101', 'Mario Santos', 42, '0917-123-4411', 'Mild dizziness and headache', 'Moderate', NOW() - INTERVAL '2 hour', 'Dr. Humour', 'waiting_for_doctor'),
  ('WALK-2026-102', 'Juana Reyes', 27, '0916-994-1209', 'Small hand laceration', 'Low', NOW() - INTERVAL '1 hour 40 minute', 'Nurse Triage', 'triage_pending'),
  ('WALK-2026-098', 'Nina Cruz', 29, '0915-445-1992', 'Initial intake', 'Low', NOW() - INTERVAL '35 minute', 'Nurse Triage', 'waiting'),
  ('WALK-2026-096', 'Paolo Lim', 31, '0922-117-6200', 'Identity confirmed for triage', 'Low', NOW() - INTERVAL '25 minute', 'Nurse Triage', 'identified'),
  ('WALK-2026-097', 'Carlo Diaz', 37, '0991-000-1288', 'Blood pressure spike', 'Moderate', NOW() - INTERVAL '55 minute', 'Nurse Triage', 'in_triage'),
  ('WALK-2026-103', 'Rico Dela Cruz', 56, '0920-334-7781', 'Chest discomfort, shortness of breath', 'Emergency', NOW() - INTERVAL '1 hour 25 minute', 'ER Team', 'emergency'),
  ('WALK-2026-104', 'Ana Perez', 33, '0919-331-8880', 'Fever and persistent cough', 'Moderate', NOW() - INTERVAL '2 hour 30 minute', 'Dr. Jenni', 'waiting_for_doctor'),
  ('WALK-2026-099', 'Leo Magno', 24, '0918-776-4022', 'Minor ankle sprain', 'Low', NOW() - INTERVAL '3 hour', 'Dr. Morco', 'completed')
ON CONFLICT (case_id) DO NOTHING;

COMMIT;
