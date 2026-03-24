-- Clinic Health Reports — individual student/patient health issue reports sent to PMED.
-- Stores each health visit report with the medicine/first aid used.

CREATE TABLE IF NOT EXISTS clinic_health_reports (
  id                  BIGSERIAL PRIMARY KEY,
  report_code         VARCHAR(60)  NOT NULL UNIQUE,
  student_id          VARCHAR(80)  NULL,
  student_name        VARCHAR(150) NOT NULL,
  student_type        VARCHAR(20)  NOT NULL DEFAULT 'student'
                        CHECK (student_type IN ('student', 'teacher', 'unknown')),
  grade_section       VARCHAR(120) NULL,
  age                 SMALLINT     NULL CHECK (age BETWEEN 0 AND 120),
  sex                 VARCHAR(20)  NULL,
  -- Health details
  health_issue        TEXT         NOT NULL,
  symptoms            TEXT         NULL,
  severity            VARCHAR(20)  NOT NULL DEFAULT 'low'
                        CHECK (severity IN ('low', 'moderate', 'high', 'emergency')),
  -- Treatment
  treatment_given     TEXT         NULL,
  medicines_used      JSONB        NOT NULL DEFAULT '[]'::jsonb,
  first_aid_given     TEXT         NULL,
  -- Staff
  attending_staff     VARCHAR(150) NOT NULL DEFAULT '',
  remarks             TEXT         NULL,
  -- PMED delivery
  sent_to_pmed        SMALLINT     NOT NULL DEFAULT 0,
  pmed_sent_at        TIMESTAMP    NULL,
  pmed_entity_key     VARCHAR(120) NULL,
  -- Timestamps
  created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_health_reports_student_id
  ON clinic_health_reports (student_id);

CREATE INDEX IF NOT EXISTS idx_clinic_health_reports_created_at
  ON clinic_health_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinic_health_reports_sent_to_pmed
  ON clinic_health_reports (sent_to_pmed);
