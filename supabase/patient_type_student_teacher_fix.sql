-- Normalize all patient_type values to only: student, teacher
-- Safe to run on an existing Supabase/PostgreSQL database after schema.sql.

BEGIN;

CREATE SCHEMA IF NOT EXISTS clinic;

CREATE OR REPLACE FUNCTION clinic.resolve_patient_type(
  raw_type TEXT,
  raw_role TEXT DEFAULT NULL,
  patient_id TEXT DEFAULT NULL,
  patient_name TEXT DEFAULT NULL,
  patient_email TEXT DEFAULT NULL,
  context_text TEXT DEFAULT NULL,
  numeric_age INT DEFAULT NULL,
  dob DATE DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized_type TEXT := LOWER(TRIM(COALESCE(raw_type, '')));
  normalized_role TEXT := LOWER(TRIM(COALESCE(raw_role, '')));
  normalized_id TEXT := LOWER(TRIM(COALESCE(patient_id, '')));
  haystack TEXT := LOWER(CONCAT_WS(' ',
    COALESCE(patient_name, ''),
    COALESCE(patient_email, ''),
    COALESCE(context_text, ''),
    COALESCE(patient_id, '')
  ));
  derived_age INT;
BEGIN
  IF normalized_type IN ('student', 'teacher') THEN
    RETURN normalized_type;
  END IF;

  IF normalized_role IN ('student', 'teacher') THEN
    RETURN normalized_role;
  END IF;

  IF normalized_id ~ '^(stu|student)[-_:\/]' THEN
    RETURN 'student';
  END IF;

  IF normalized_id ~ '^(emp|teacher|faculty|staff)[-_:\/]' THEN
    RETURN 'teacher';
  END IF;

  IF haystack ~ '(teacher|faculty|professor|prof\.|instructor|staff|employee)' THEN
    RETURN 'teacher';
  END IF;

  IF haystack ~ '(student|learner|pupil)' THEN
    RETURN 'student';
  END IF;

  IF numeric_age IS NOT NULL AND numeric_age > 0 THEN
    IF numeric_age <= 23 THEN
      RETURN 'student';
    END IF;
    RETURN 'teacher';
  END IF;

  IF dob IS NOT NULL THEN
    derived_age := EXTRACT(YEAR FROM age(CURRENT_DATE, dob));
    IF derived_age <= 23 THEN
      RETURN 'student';
    END IF;
    RETURN 'teacher';
  END IF;

  RETURN 'student';
END;
$$;

ALTER TABLE public.patient_appointments ADD COLUMN IF NOT EXISTS patient_type VARCHAR(20) NOT NULL DEFAULT 'student';
ALTER TABLE public.patient_registrations ADD COLUMN IF NOT EXISTS patient_type VARCHAR(20) NOT NULL DEFAULT 'student';
ALTER TABLE public.patient_walkins ADD COLUMN IF NOT EXISTS patient_type VARCHAR(20) NOT NULL DEFAULT 'student';
ALTER TABLE public.checkup_visits ADD COLUMN IF NOT EXISTS patient_type VARCHAR(20) NOT NULL DEFAULT 'student';
ALTER TABLE public.laboratory_requests ADD COLUMN IF NOT EXISTS patient_type VARCHAR(20) NOT NULL DEFAULT 'student';
ALTER TABLE public.mental_health_patients ADD COLUMN IF NOT EXISTS patient_type VARCHAR(20) NOT NULL DEFAULT 'student';
ALTER TABLE public.mental_health_sessions ADD COLUMN IF NOT EXISTS patient_type VARCHAR(20) NOT NULL DEFAULT 'student';
ALTER TABLE public.patient_master ADD COLUMN IF NOT EXISTS patient_type VARCHAR(20) NOT NULL DEFAULT 'student';

ALTER TABLE public.patient_appointments ALTER COLUMN patient_type SET DEFAULT 'student';
ALTER TABLE public.patient_registrations ALTER COLUMN patient_type SET DEFAULT 'student';
ALTER TABLE public.patient_walkins ALTER COLUMN patient_type SET DEFAULT 'student';
ALTER TABLE public.checkup_visits ALTER COLUMN patient_type SET DEFAULT 'student';
ALTER TABLE public.laboratory_requests ALTER COLUMN patient_type SET DEFAULT 'student';
ALTER TABLE public.mental_health_patients ALTER COLUMN patient_type SET DEFAULT 'student';
ALTER TABLE public.mental_health_sessions ALTER COLUMN patient_type SET DEFAULT 'student';
ALTER TABLE public.patient_master ALTER COLUMN patient_type SET DEFAULT 'student';
ALTER TABLE clinic.department_clearance_records ALTER COLUMN patient_type SET DEFAULT 'student';
ALTER TABLE clinic.cashier_integration_events ALTER COLUMN patient_type SET DEFAULT 'student';

UPDATE public.patient_appointments a
SET patient_type = clinic.resolve_patient_type(
  a.patient_type,
  a.actor_role,
  a.patient_id,
  a.patient_name,
  a.patient_email,
  CONCAT_WS(' ', a.visit_reason, a.visit_type, a.symptoms_summary),
  a.patient_age,
  NULL
);

UPDATE public.patient_registrations r
SET patient_type = clinic.resolve_patient_type(
  r.patient_type,
  NULL,
  NULL,
  r.patient_name,
  r.patient_email,
  r.concern,
  r.age,
  NULL
);

UPDATE public.patient_walkins w
SET patient_type = clinic.resolve_patient_type(
  w.patient_type,
  NULL,
  w.patient_ref,
  w.patient_name,
  NULL,
  CONCAT_WS(' ', w.chief_complaint, w.visit_department, w.severity),
  w.age,
  w.date_of_birth
);

UPDATE public.mental_health_patients p
SET patient_type = clinic.resolve_patient_type(
  p.patient_type,
  NULL,
  p.patient_id,
  p.patient_name,
  NULL,
  p.guardian_contact,
  NULL,
  p.date_of_birth
);

UPDATE public.mental_health_sessions s
SET patient_type = COALESCE(
  (
    SELECT p.patient_type
    FROM public.mental_health_patients p
    WHERE p.patient_id = s.patient_id
    LIMIT 1
  ),
  clinic.resolve_patient_type(
    s.patient_type,
    NULL,
    s.patient_id,
    s.patient_name,
    NULL,
    CONCAT_WS(' ', s.session_type, s.diagnosis_condition, s.session_goals),
    NULL,
    NULL
  )
);

UPDATE public.patient_master pm
SET patient_type = COALESCE(
  (
    SELECT a.patient_type
    FROM public.patient_appointments a
    WHERE a.patient_id = pm.patient_code
       OR LOWER(TRIM(a.patient_name)) = LOWER(TRIM(pm.patient_name))
       OR (pm.email IS NOT NULL AND LOWER(TRIM(a.patient_email)) = LOWER(TRIM(pm.email)))
    ORDER BY COALESCE(a.updated_at, a.created_at, CURRENT_TIMESTAMP) DESC
    LIMIT 1
  ),
  (
    SELECT w.patient_type
    FROM public.patient_walkins w
    WHERE w.patient_ref = pm.patient_code
       OR LOWER(TRIM(w.patient_name)) = LOWER(TRIM(pm.patient_name))
    ORDER BY COALESCE(w.updated_at, w.created_at, CURRENT_TIMESTAMP) DESC
    LIMIT 1
  ),
  (
    SELECT p.patient_type
    FROM public.mental_health_patients p
    WHERE p.patient_id = pm.patient_code
       OR LOWER(TRIM(p.patient_name)) = LOWER(TRIM(pm.patient_name))
    ORDER BY COALESCE(p.updated_at, p.created_at, CURRENT_TIMESTAMP) DESC
    LIMIT 1
  ),
  clinic.resolve_patient_type(
    pm.patient_type,
    NULL,
    pm.patient_code,
    pm.patient_name,
    pm.email,
    NULL,
    pm.age,
    pm.date_of_birth
  )
);

UPDATE public.checkup_visits c
SET patient_type = COALESCE(
  (
    SELECT a.patient_type
    FROM public.patient_appointments a
    WHERE LOWER(TRIM(a.patient_name)) = LOWER(TRIM(c.patient_name))
    ORDER BY COALESCE(a.updated_at, a.created_at, CURRENT_TIMESTAMP) DESC
    LIMIT 1
  ),
  (
    SELECT w.patient_type
    FROM public.patient_walkins w
    WHERE LOWER(TRIM(w.patient_name)) = LOWER(TRIM(c.patient_name))
    ORDER BY COALESCE(w.updated_at, w.created_at, CURRENT_TIMESTAMP) DESC
    LIMIT 1
  ),
  (
    SELECT pm.patient_type
    FROM public.patient_master pm
    WHERE LOWER(TRIM(pm.patient_name)) = LOWER(TRIM(c.patient_name))
    ORDER BY COALESCE(pm.last_seen_at, pm.updated_at, pm.created_at, CURRENT_TIMESTAMP) DESC
    LIMIT 1
  ),
  clinic.resolve_patient_type(
    c.patient_type,
    NULL,
    NULL,
    c.patient_name,
    NULL,
    CONCAT_WS(' ', c.source, c.chief_complaint, c.diagnosis),
    NULL,
    NULL
  )
);

UPDATE public.laboratory_requests l
SET patient_type = COALESCE(
  (
    SELECT pm.patient_type
    FROM public.patient_master pm
    WHERE pm.patient_code = l.patient_id
       OR LOWER(TRIM(pm.patient_name)) = LOWER(TRIM(l.patient_name))
    ORDER BY COALESCE(pm.last_seen_at, pm.updated_at, pm.created_at, CURRENT_TIMESTAMP) DESC
    LIMIT 1
  ),
  clinic.resolve_patient_type(
    l.patient_type,
    NULL,
    l.patient_id,
    l.patient_name,
    NULL,
    CONCAT_WS(' ', l.category, l.clinical_diagnosis, l.doctor_department),
    l.age,
    NULL
  )
);

UPDATE clinic.cashier_integration_events e
SET patient_type = COALESCE(
  CASE
    WHEN e.source_module = 'appointments' THEN (
      SELECT a.patient_type
      FROM public.patient_appointments a
      WHERE a.booking_id = e.source_key
      LIMIT 1
    )
    WHEN e.source_module = 'laboratory' THEN (
      SELECT l.patient_type
      FROM public.laboratory_requests l
      WHERE l.request_code = e.source_key OR CAST(l.id AS TEXT) = e.source_key
      LIMIT 1
    )
    ELSE NULL
  END,
  (
    SELECT pm.patient_type
    FROM public.patient_master pm
    WHERE LOWER(TRIM(pm.patient_name)) = LOWER(TRIM(e.patient_name))
       OR pm.patient_code = e.reference_no
    ORDER BY COALESCE(pm.last_seen_at, pm.updated_at, pm.created_at, CURRENT_TIMESTAMP) DESC
    LIMIT 1
  ),
  clinic.resolve_patient_type(
    e.patient_type,
    NULL,
    e.reference_no,
    e.patient_name,
    NULL,
    e.source_module,
    NULL,
    NULL
  )
);

UPDATE clinic.department_clearance_records d
SET patient_type = COALESCE(
  (
    SELECT pm.patient_type
    FROM public.patient_master pm
    WHERE pm.patient_code = d.patient_code
       OR pm.patient_code = d.patient_id
       OR LOWER(TRIM(pm.patient_name)) = LOWER(TRIM(d.patient_name))
    ORDER BY COALESCE(pm.last_seen_at, pm.updated_at, pm.created_at, CURRENT_TIMESTAMP) DESC
    LIMIT 1
  ),
  clinic.resolve_patient_type(
    d.patient_type,
    NULL,
    d.patient_code,
    d.patient_name,
    NULL,
    d.department_key,
    NULL,
    NULL
  )
);

ALTER TABLE public.patient_appointments DROP CONSTRAINT IF EXISTS patient_appointments_patient_type_check;
ALTER TABLE public.patient_appointments ADD CONSTRAINT patient_appointments_patient_type_check CHECK (patient_type IN ('student', 'teacher')) NOT VALID;
ALTER TABLE public.patient_registrations DROP CONSTRAINT IF EXISTS patient_registrations_patient_type_check;
ALTER TABLE public.patient_registrations ADD CONSTRAINT patient_registrations_patient_type_check CHECK (patient_type IN ('student', 'teacher')) NOT VALID;
ALTER TABLE public.patient_walkins DROP CONSTRAINT IF EXISTS patient_walkins_patient_type_check;
ALTER TABLE public.patient_walkins ADD CONSTRAINT patient_walkins_patient_type_check CHECK (patient_type IN ('student', 'teacher')) NOT VALID;
ALTER TABLE public.checkup_visits DROP CONSTRAINT IF EXISTS checkup_visits_patient_type_check;
ALTER TABLE public.checkup_visits ADD CONSTRAINT checkup_visits_patient_type_check CHECK (patient_type IN ('student', 'teacher')) NOT VALID;
ALTER TABLE public.laboratory_requests DROP CONSTRAINT IF EXISTS laboratory_requests_patient_type_check;
ALTER TABLE public.laboratory_requests ADD CONSTRAINT laboratory_requests_patient_type_check CHECK (patient_type IN ('student', 'teacher')) NOT VALID;
ALTER TABLE public.mental_health_patients DROP CONSTRAINT IF EXISTS mental_health_patients_patient_type_check;
ALTER TABLE public.mental_health_patients ADD CONSTRAINT mental_health_patients_patient_type_check CHECK (patient_type IN ('student', 'teacher')) NOT VALID;
ALTER TABLE public.mental_health_sessions DROP CONSTRAINT IF EXISTS mental_health_sessions_patient_type_check;
ALTER TABLE public.mental_health_sessions ADD CONSTRAINT mental_health_sessions_patient_type_check CHECK (patient_type IN ('student', 'teacher')) NOT VALID;
ALTER TABLE public.patient_master DROP CONSTRAINT IF EXISTS patient_master_patient_type_check;
ALTER TABLE public.patient_master ADD CONSTRAINT patient_master_patient_type_check CHECK (patient_type IN ('student', 'teacher')) NOT VALID;
ALTER TABLE clinic.department_clearance_records DROP CONSTRAINT IF EXISTS department_clearance_records_patient_type_check;
ALTER TABLE clinic.department_clearance_records ADD CONSTRAINT department_clearance_records_patient_type_check CHECK (patient_type IN ('student', 'teacher')) NOT VALID;
ALTER TABLE clinic.cashier_integration_events DROP CONSTRAINT IF EXISTS cashier_integration_events_patient_type_check;
ALTER TABLE clinic.cashier_integration_events ADD CONSTRAINT cashier_integration_events_patient_type_check CHECK (patient_type IN ('student', 'teacher')) NOT VALID;

ALTER TABLE public.patient_appointments VALIDATE CONSTRAINT patient_appointments_patient_type_check;
ALTER TABLE public.patient_registrations VALIDATE CONSTRAINT patient_registrations_patient_type_check;
ALTER TABLE public.patient_walkins VALIDATE CONSTRAINT patient_walkins_patient_type_check;
ALTER TABLE public.checkup_visits VALIDATE CONSTRAINT checkup_visits_patient_type_check;
ALTER TABLE public.laboratory_requests VALIDATE CONSTRAINT laboratory_requests_patient_type_check;
ALTER TABLE public.mental_health_patients VALIDATE CONSTRAINT mental_health_patients_patient_type_check;
ALTER TABLE public.mental_health_sessions VALIDATE CONSTRAINT mental_health_sessions_patient_type_check;
ALTER TABLE public.patient_master VALIDATE CONSTRAINT patient_master_patient_type_check;
ALTER TABLE clinic.department_clearance_records VALIDATE CONSTRAINT department_clearance_records_patient_type_check;
ALTER TABLE clinic.cashier_integration_events VALIDATE CONSTRAINT cashier_integration_events_patient_type_check;

COMMIT;
