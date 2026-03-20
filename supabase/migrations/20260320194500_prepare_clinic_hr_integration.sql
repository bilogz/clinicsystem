-- Align the clinic-side shared integration contract with the HR integration schema.
-- Run this on existing clinic databases before connecting the HR application.

CREATE SCHEMA IF NOT EXISTS clinic;
CREATE SCHEMA IF NOT EXISTS hr;

ALTER TABLE IF EXISTS clinic.department_clearance_records
  ALTER COLUMN patient_type SET DEFAULT 'unknown';

ALTER TABLE IF EXISTS clinic.cashier_integration_events
  ALTER COLUMN patient_type SET DEFAULT 'unknown';

ALTER TABLE IF EXISTS clinic.department_clearance_records
  DROP CONSTRAINT IF EXISTS department_clearance_records_patient_type_check;

ALTER TABLE IF EXISTS clinic.department_clearance_records
  ADD CONSTRAINT department_clearance_records_patient_type_check
  CHECK (patient_type IN ('student', 'teacher', 'unknown')) NOT VALID;

ALTER TABLE IF EXISTS clinic.cashier_integration_events
  DROP CONSTRAINT IF EXISTS cashier_integration_events_patient_type_check;

ALTER TABLE IF EXISTS clinic.cashier_integration_events
  ADD CONSTRAINT cashier_integration_events_patient_type_check
  CHECK (patient_type IN ('student', 'teacher', 'unknown')) NOT VALID;

DO $$
DECLARE
  rel record;
BEGIN
  FOR rel IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'hr'
      AND c.relname = ANY (ARRAY[
        'department_flow_profiles',
        'department_clearance_records',
        'cashier_integration_events',
        'cashier_payment_links',
        'clinic_cashier_sync_logs',
        'clinic_cashier_audit_logs'
      ])
  LOOP
    IF rel.relkind = 'v' THEN
      EXECUTE format('DROP VIEW IF EXISTS hr.%I CASCADE', rel.relname);
    ELSIF rel.relkind = 'm' THEN
      EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS hr.%I CASCADE', rel.relname);
    ELSE
      EXECUTE format('DROP TABLE IF EXISTS hr.%I CASCADE', rel.relname);
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE VIEW hr.department_flow_profiles AS SELECT * FROM clinic.department_flow_profiles;
CREATE OR REPLACE VIEW hr.department_clearance_records AS SELECT * FROM clinic.department_clearance_records;
CREATE OR REPLACE VIEW hr.cashier_integration_events AS SELECT * FROM clinic.cashier_integration_events;
CREATE OR REPLACE VIEW hr.cashier_payment_links AS SELECT * FROM clinic.cashier_payment_links;
CREATE OR REPLACE VIEW hr.clinic_cashier_sync_logs AS SELECT * FROM clinic.clinic_cashier_sync_logs;
CREATE OR REPLACE VIEW hr.clinic_cashier_audit_logs AS SELECT * FROM clinic.clinic_cashier_audit_logs;
