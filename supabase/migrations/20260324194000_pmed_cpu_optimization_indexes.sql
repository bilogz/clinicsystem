-- PMED CPU optimization indexes
-- These indexes target frequent PMED filters that use LOWER(...)
-- in API queries and can otherwise force sequential scans.

DO $$
BEGIN
  IF to_regclass('clinic.cashier_integration_events') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_cashier_events_lower_source_module_updated
      ON clinic.cashier_integration_events ((lower(source_module)), updated_at DESC, event_key DESC)
    ';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('clinic.cashier_payment_links') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_cashier_payment_links_lower_source_module_source_key
      ON clinic.cashier_payment_links ((lower(source_module)), source_key)
    ';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('clinic.department_clearance_records') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_clearance_lower_department_updated_ref
      ON clinic.department_clearance_records ((lower(department_key)), updated_at DESC, clearance_reference DESC)
    ';
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_clearance_lower_target_department_updated
      ON clinic.department_clearance_records ((lower(coalesce(metadata->>'target_department', ''))), updated_at DESC)
    $sql$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('clinic.department_flow_profiles') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_flow_profiles_lower_department_key
      ON clinic.department_flow_profiles ((lower(department_key)))
    ';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.module_activity_logs') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_public_module_activity_lower_module_created
      ON public.module_activity_logs ((lower(module)), created_at DESC)
    ';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('clinic.module_activity_logs') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_clinic_module_activity_lower_module_created
      ON clinic.module_activity_logs ((lower(module)), created_at DESC)
    ';
  END IF;
END
$$;

