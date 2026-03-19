-- Department integration merge script.
-- Run clinic first, then any department scripts you need.
-- Department: PMED

CREATE SCHEMA IF NOT EXISTS pmed;
CREATE SCHEMA IF NOT EXISTS clinic;
SET search_path TO pmed, clinic, public;
DO $$
DECLARE
  rel record;
BEGIN
  FOR rel IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pmed'
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
      EXECUTE format('DROP VIEW IF EXISTS pmed.%I CASCADE', rel.relname);
    ELSIF rel.relkind = 'm' THEN
      EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS pmed.%I CASCADE', rel.relname);
    ELSE
      EXECUTE format('DROP TABLE IF EXISTS pmed.%I CASCADE', rel.relname);
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE VIEW pmed.department_flow_profiles AS SELECT * FROM clinic.department_flow_profiles;
CREATE OR REPLACE VIEW pmed.department_clearance_records AS SELECT * FROM clinic.department_clearance_records;
CREATE OR REPLACE VIEW pmed.cashier_integration_events AS SELECT * FROM clinic.cashier_integration_events;
CREATE OR REPLACE VIEW pmed.cashier_payment_links AS SELECT * FROM clinic.cashier_payment_links;
CREATE OR REPLACE VIEW pmed.clinic_cashier_sync_logs AS SELECT * FROM clinic.clinic_cashier_sync_logs;
CREATE OR REPLACE VIEW pmed.clinic_cashier_audit_logs AS SELECT * FROM clinic.clinic_cashier_audit_logs;
-- Flow definitions are seeded centrally via supabase/seed.sql.
SET search_path TO public;

