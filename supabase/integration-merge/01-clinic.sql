-- Department integration merge script.
-- Run clinic first, then any department scripts you need.
-- Department: Clinic

CREATE SCHEMA IF NOT EXISTS clinic;
SET search_path TO clinic, public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION clinic.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS clinic.department_flow_profiles (
  department_key TEXT PRIMARY KEY,
  department_name TEXT NOT NULL,
  flow_order INT NOT NULL UNIQUE,
  clearance_stage_order INT NOT NULL UNIQUE,
  receives JSONB NOT NULL DEFAULT '[]'::jsonb,
  sends JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinic.department_clearance_records (
  id BIGSERIAL PRIMARY KEY,
  clearance_reference TEXT NOT NULL UNIQUE,
  patient_id TEXT NULL,
  patient_code TEXT NULL,
  patient_name TEXT NOT NULL,
  patient_type TEXT NOT NULL DEFAULT 'unknown',
  department_key TEXT NOT NULL REFERENCES clinic.department_flow_profiles (department_key) ON DELETE RESTRICT,
  department_name TEXT NOT NULL,
  stage_order INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  remarks TEXT NULL,
  approver_name TEXT NULL,
  approver_role TEXT NULL,
  external_reference TEXT NULL,
  requested_by TEXT NULL,
  decided_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinic.cashier_integration_events (
  id BIGSERIAL PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  source_module TEXT NOT NULL,
  source_entity TEXT NOT NULL,
  source_key TEXT NOT NULL,
  patient_name TEXT NULL,
  patient_type TEXT NOT NULL DEFAULT 'unknown',
  reference_no TEXT NULL,
  amount_due NUMERIC(10, 2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'PHP',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT NULL,
  synced_at TIMESTAMPTZ NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinic.cashier_payment_links (
  id BIGSERIAL PRIMARY KEY,
  source_module TEXT NOT NULL,
  source_key TEXT NOT NULL,
  cashier_reference TEXT NULL,
  cashier_billing_id BIGINT NULL,
  invoice_number TEXT NULL,
  official_receipt TEXT NULL,
  amount_due NUMERIC(10, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(10, 2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  latest_payment_method TEXT NULL,
  cashier_can_proceed SMALLINT NOT NULL DEFAULT 0,
  cashier_verified_at TIMESTAMPTZ NULL,
  paid_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_module, source_key)
);

CREATE TABLE IF NOT EXISTS clinic.clinic_cashier_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  source_module TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  cashier_billing_id BIGINT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NULL,
  extra_payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinic.clinic_cashier_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  source_module TEXT NOT NULL,
  source_id TEXT NOT NULL,
  action_name TEXT NOT NULL,
  status_after TEXT NOT NULL,
  remarks TEXT NULL,
  actor_name TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clearance_department
  ON clinic.department_clearance_records (department_key, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clearance_patient
  ON clinic.department_clearance_records (patient_name, patient_code);
CREATE INDEX IF NOT EXISTS idx_cashier_events_sync_status
  ON clinic.cashier_integration_events (sync_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cashier_events_source_lookup
  ON clinic.cashier_integration_events (source_module, source_key);
CREATE INDEX IF NOT EXISTS idx_cashier_reference
  ON clinic.cashier_payment_links (cashier_reference);
CREATE INDEX IF NOT EXISTS idx_clinic_cashier_sync_lookup
  ON clinic.clinic_cashier_sync_logs (source_module, source_id);
CREATE INDEX IF NOT EXISTS idx_clinic_cashier_sync_status
  ON clinic.clinic_cashier_sync_logs (sync_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinic_cashier_audit_source
  ON clinic.clinic_cashier_audit_logs (source_module, source_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_department_flow_profiles_updated_at ON clinic.department_flow_profiles;
CREATE TRIGGER trg_department_flow_profiles_updated_at
BEFORE UPDATE ON clinic.department_flow_profiles
FOR EACH ROW
EXECUTE FUNCTION clinic.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_department_clearance_records_updated_at ON clinic.department_clearance_records;
CREATE TRIGGER trg_department_clearance_records_updated_at
BEFORE UPDATE ON clinic.department_clearance_records
FOR EACH ROW
EXECUTE FUNCTION clinic.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_cashier_integration_events_updated_at ON clinic.cashier_integration_events;
CREATE TRIGGER trg_cashier_integration_events_updated_at
BEFORE UPDATE ON clinic.cashier_integration_events
FOR EACH ROW
EXECUTE FUNCTION clinic.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_cashier_payment_links_updated_at ON clinic.cashier_payment_links;
CREATE TRIGGER trg_cashier_payment_links_updated_at
BEFORE UPDATE ON clinic.cashier_payment_links
FOR EACH ROW
EXECUTE FUNCTION clinic.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_clinic_cashier_sync_logs_updated_at ON clinic.clinic_cashier_sync_logs;
CREATE TRIGGER trg_clinic_cashier_sync_logs_updated_at
BEFORE UPDATE ON clinic.clinic_cashier_sync_logs
FOR EACH ROW
EXECUTE FUNCTION clinic.set_updated_at_timestamp();
INSERT INTO clinic.department_flow_profiles (
  department_key,
  department_name,
  flow_order,
  clearance_stage_order,
  receives,
  sends,
  notes
)
VALUES (
  'clinic',
  'Clinic',
  3,
  3,
  '[
    {"message":"Student identity data","from":"registrar"},
    {"message":"Staff identity data","from":"hr"},
    {"message":"Health incident reports","from":"prefect"}
  ]'::jsonb,
  '[
    {"message":"Medical clearance status","to":"registrar"},
    {"message":"Visit history summary","to":"pmed"}
  ]'::jsonb,
  'Stores medical visits, consultations, health records, and clearances.'
)
ON CONFLICT (department_key) DO UPDATE
SET
  department_name = EXCLUDED.department_name,
  flow_order = EXCLUDED.flow_order,
  clearance_stage_order = EXCLUDED.clearance_stage_order,
  receives = EXCLUDED.receives,
  sends = EXCLUDED.sends,
  notes = EXCLUDED.notes,
  updated_at = NOW();
SET search_path TO public;

