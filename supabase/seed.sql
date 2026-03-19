-- Clinic System end-to-end Supabase seed
-- Run after supabase/schema.sql.
--
-- This seed is intentionally compact but complete enough to exercise:
-- - Admin login
-- - Appointments / patient sync
-- - Cashier integration queue + payment links
-- - Department clearance flow

BEGIN;

CREATE SCHEMA IF NOT EXISTS clinic;
SET search_path TO clinic, public;

DELETE FROM clinic.department_flow_profiles
WHERE department_key IN (
  'registrar',
  'cashier',
  'clinic',
  'guidance',
  'prefect',
  'comlab',
  'crad',
  'hr',
  'pmed'
);

INSERT INTO public.admin_profiles (
  username,
  full_name,
  email,
  role,
  department,
  access_exemptions,
  is_super_admin,
  password_hash,
  status,
  phone
)
VALUES (
  'joecelgarcia1@gmail.com',
  'Nexora Super Admin',
  'joecelgarcia1@gmail.com',
  'Admin',
  'Administration',
  ARRAY[
    'appointments',
    'patients',
    'registration',
    'walkin',
    'checkup',
    'pharmacy',
    'mental_health',
    'cashier_integration',
    'reports'
  ]::TEXT[],
  1,
  '963f8fc45d4a791f530b0ab50274c951:f5766265353590c6bfd1fb80f6a94d590c3fe8d29f50618df00a4936decb0c960c189457801c991d3209a3ed879c0496830436040e0fe8b1de6402fb9e8807bc',
  'active',
  '+63 912 345 6789'
)
ON CONFLICT (username) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  department = EXCLUDED.department,
  access_exemptions = EXCLUDED.access_exemptions,
  is_super_admin = EXCLUDED.is_super_admin,
  password_hash = EXCLUDED.password_hash,
  status = EXCLUDED.status,
  phone = EXCLUDED.phone;

INSERT INTO public.admin_activity_logs (username, action, raw_action, description, ip_address, created_at)
SELECT
  'joecelgarcia1@gmail.com',
  'Seed Prepared',
  'SEED_PREPARED',
  'Supabase end-to-end workflow seed loaded.',
  '127.0.0.1',
  TIMESTAMP '2026-03-19 09:00:00'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.admin_activity_logs
  WHERE username = 'joecelgarcia1@gmail.com'
    AND raw_action = 'SEED_PREPARED'
    AND created_at = TIMESTAMP '2026-03-19 09:00:00'
);

INSERT INTO public.doctors (doctor_name, department_name, specialization, is_active)
VALUES
  ('Dr. Humour', 'General Medicine', 'Internal Medicine', 1),
  ('Dr. Rivera', 'Mental Health', 'Psychiatry', 1),
  ('Dr. Morco', 'Emergency', 'Emergency Medicine', 1)
ON CONFLICT (doctor_name) DO UPDATE
SET
  department_name = EXCLUDED.department_name,
  specialization = EXCLUDED.specialization,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO public.doctor_availability (
  doctor_name,
  department_name,
  day_of_week,
  start_time,
  end_time,
  max_appointments,
  is_active
)
VALUES
  ('Dr. Humour', 'General Medicine', 1, '08:00:00', '12:00:00', 8, 1),
  ('Dr. Humour', 'General Medicine', 4, '08:00:00', '12:00:00', 8, 1),
  ('Dr. Rivera', 'Mental Health', 4, '13:00:00', '18:00:00', 6, 1),
  ('Dr. Morco', 'Emergency', 4, '08:00:00', '17:00:00', 10, 1)
ON CONFLICT (doctor_name, department_name, day_of_week, start_time, end_time) DO UPDATE
SET
  max_appointments = EXCLUDED.max_appointments,
  is_active = EXCLUDED.is_active,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO public.patient_appointments (
  booking_id,
  patient_id,
  patient_name,
  patient_age,
  patient_email,
  patient_gender,
  patient_type,
  guardian_name,
  phone_number,
  emergency_contact,
  insurance_provider,
  payment_method,
  actor_role,
  appointment_priority,
  symptoms_summary,
  doctor_notes,
  doctor_name,
  department_name,
  visit_type,
  appointment_date,
  preferred_time,
  visit_reason,
  status,
  created_at,
  updated_at
)
VALUES
  (
    'APT-E2E-1001',
    'STU-1001',
    'Maria Santos',
    21,
    'maria.santos@bcpclinic.test',
    'Female',
    'student',
    'Lourdes Santos',
    '09171234001',
    '09189990001',
    'CarePlus',
    'Cash',
    'student',
    'Routine',
    'Recurring migraine episodes',
    'Cashier-cleared consultation ready for doctor review.',
    'Dr. Humour',
    'General Medicine',
    'Consultation',
    DATE '2026-03-20',
    '09:00',
    'Migraine follow-up',
    'Confirmed',
    TIMESTAMP '2026-03-19 08:45:00',
    TIMESTAMP '2026-03-19 09:10:00'
  ),
  (
    'APT-E2E-1002',
    'EMP-2001',
    'Carlo Diaz',
    41,
    'carlo.diaz@bcpclinic.test',
    'Male',
    'teacher',
    NULL,
    '09172001003',
    '09182001003',
    NULL,
    'Card',
    'teacher',
    'Urgent',
    'Follow-up after elevated blood pressure reading',
    'Keep on awaiting while cashier shows balance due.',
    'Dr. Humour',
    'General Medicine',
    'Follow-Up',
    DATE '2026-03-20',
    '10:30',
    'Blood pressure review',
    'Awaiting',
    TIMESTAMP '2026-03-19 09:00:00',
    TIMESTAMP '2026-03-19 09:20:00'
  ),
  (
    'APT-E2E-1003',
    'STU-1002',
    'Ella Tan',
    20,
    'ella.tan@bcpclinic.test',
    'Female',
    'student',
    'Mila Tan',
    '09171001006',
    '09183001001',
    'HMA',
    'HMA',
    'student',
    'Routine',
    'Counseling intake and wellness endorsement follow-up',
    'Linked to PMED hold and cashier still waiting for release.',
    'Dr. Rivera',
    'Mental Health',
    'Counseling',
    DATE '2026-03-20',
    '14:00',
    'Initial counseling intake',
    'Awaiting',
    TIMESTAMP '2026-03-19 09:15:00',
    TIMESTAMP '2026-03-19 09:25:00'
  )
ON CONFLICT (booking_id) DO UPDATE
SET
  patient_id = EXCLUDED.patient_id,
  patient_name = EXCLUDED.patient_name,
  patient_age = EXCLUDED.patient_age,
  patient_email = EXCLUDED.patient_email,
  patient_gender = EXCLUDED.patient_gender,
  patient_type = EXCLUDED.patient_type,
  guardian_name = EXCLUDED.guardian_name,
  phone_number = EXCLUDED.phone_number,
  emergency_contact = EXCLUDED.emergency_contact,
  insurance_provider = EXCLUDED.insurance_provider,
  payment_method = EXCLUDED.payment_method,
  actor_role = EXCLUDED.actor_role,
  appointment_priority = EXCLUDED.appointment_priority,
  symptoms_summary = EXCLUDED.symptoms_summary,
  doctor_notes = EXCLUDED.doctor_notes,
  doctor_name = EXCLUDED.doctor_name,
  department_name = EXCLUDED.department_name,
  visit_type = EXCLUDED.visit_type,
  appointment_date = EXCLUDED.appointment_date,
  preferred_time = EXCLUDED.preferred_time,
  visit_reason = EXCLUDED.visit_reason,
  status = EXCLUDED.status,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.patient_registrations (
  case_id,
  patient_name,
  patient_email,
  patient_type,
  age,
  concern,
  intake_time,
  booked_time,
  status,
  assigned_to
)
VALUES
  (
    'REG-E2E-1001',
    'Maria Santos',
    'maria.santos@bcpclinic.test',
    'student',
    21,
    'General consultation intake completed.',
    TIMESTAMP '2026-03-19 08:30:00',
    TIMESTAMP '2026-03-19 08:45:00',
    'Active',
    'Dr. Humour'
  ),
  (
    'REG-E2E-1002',
    'Ella Tan',
    'ella.tan@bcpclinic.test',
    'student',
    20,
    'Waiting for PMED endorsement before final clinic routing.',
    TIMESTAMP '2026-03-19 09:00:00',
    TIMESTAMP '2026-03-19 09:15:00',
    'Pending',
    'Dr. Rivera'
  )
ON CONFLICT (case_id) DO UPDATE
SET
  patient_name = EXCLUDED.patient_name,
  patient_email = EXCLUDED.patient_email,
  patient_type = EXCLUDED.patient_type,
  age = EXCLUDED.age,
  concern = EXCLUDED.concern,
  intake_time = EXCLUDED.intake_time,
  booked_time = EXCLUDED.booked_time,
  status = EXCLUDED.status,
  assigned_to = EXCLUDED.assigned_to,
  updated_at = NOW();

INSERT INTO public.patient_walkins (
  case_id,
  patient_name,
  patient_type,
  age,
  sex,
  date_of_birth,
  contact,
  address,
  emergency_contact,
  patient_ref,
  visit_department,
  checkin_time,
  pain_scale,
  temperature_c,
  blood_pressure,
  pulse_bpm,
  weight_kg,
  chief_complaint,
  severity,
  intake_time,
  assigned_doctor,
  status
)
VALUES
  (
    'WALK-E2E-1001',
    'Carlo Diaz',
    'teacher',
    41,
    'Male',
    DATE '1985-06-03',
    '09172001003',
    'Quezon City',
    '09182001003',
    'EMP-2001',
    'Emergency',
    TIMESTAMP '2026-03-19 10:10:00',
    6,
    37.4,
    '148/96',
    98,
    78.50,
    'Elevated blood pressure with dizziness',
    'Moderate',
    TIMESTAMP '2026-03-19 10:10:00',
    'Dr. Morco',
    'waiting_for_doctor'
  )
ON CONFLICT (case_id) DO UPDATE
SET
  patient_name = EXCLUDED.patient_name,
  patient_type = EXCLUDED.patient_type,
  age = EXCLUDED.age,
  sex = EXCLUDED.sex,
  date_of_birth = EXCLUDED.date_of_birth,
  contact = EXCLUDED.contact,
  address = EXCLUDED.address,
  emergency_contact = EXCLUDED.emergency_contact,
  patient_ref = EXCLUDED.patient_ref,
  visit_department = EXCLUDED.visit_department,
  checkin_time = EXCLUDED.checkin_time,
  pain_scale = EXCLUDED.pain_scale,
  temperature_c = EXCLUDED.temperature_c,
  blood_pressure = EXCLUDED.blood_pressure,
  pulse_bpm = EXCLUDED.pulse_bpm,
  weight_kg = EXCLUDED.weight_kg,
  chief_complaint = EXCLUDED.chief_complaint,
  severity = EXCLUDED.severity,
  intake_time = EXCLUDED.intake_time,
  assigned_doctor = EXCLUDED.assigned_doctor,
  status = EXCLUDED.status,
  updated_at = NOW();

INSERT INTO public.checkup_visits (
  visit_id,
  patient_name,
  patient_type,
  assigned_doctor,
  source,
  status,
  chief_complaint,
  diagnosis,
  clinical_notes,
  consultation_started_at,
  lab_requested,
  lab_result_ready,
  prescription_created,
  prescription_dispensed,
  follow_up_date,
  is_emergency,
  version
)
VALUES
  (
    'VISIT-E2E-1001',
    'Maria Santos',
    'student',
    'Dr. Humour',
    'appointment_confirmed',
    'in_consultation',
    'Recurring migraine episodes',
    'Migraine, observation ongoing',
    'Patient was cleared by cashier and moved into consultation.',
    TIMESTAMP '2026-03-19 09:30:00',
    0,
    0,
    1,
    0,
    DATE '2026-03-27',
    0,
    2
  ),
  (
    'VISIT-E2E-1002',
    'Carlo Diaz',
    'teacher',
    'Dr. Morco',
    'walkin_triage_completed',
    'lab_requested',
    'Elevated blood pressure with dizziness',
    'Hypertension workup',
    'Cashier still shows a remaining balance before full completion.',
    TIMESTAMP '2026-03-19 10:30:00',
    1,
    0,
    0,
    0,
    NULL,
    0,
    3
  )
ON CONFLICT (visit_id) DO UPDATE
SET
  patient_name = EXCLUDED.patient_name,
  patient_type = EXCLUDED.patient_type,
  assigned_doctor = EXCLUDED.assigned_doctor,
  source = EXCLUDED.source,
  status = EXCLUDED.status,
  chief_complaint = EXCLUDED.chief_complaint,
  diagnosis = EXCLUDED.diagnosis,
  clinical_notes = EXCLUDED.clinical_notes,
  consultation_started_at = EXCLUDED.consultation_started_at,
  lab_requested = EXCLUDED.lab_requested,
  lab_result_ready = EXCLUDED.lab_result_ready,
  prescription_created = EXCLUDED.prescription_created,
  prescription_dispensed = EXCLUDED.prescription_dispensed,
  follow_up_date = EXCLUDED.follow_up_date,
  is_emergency = EXCLUDED.is_emergency,
  version = EXCLUDED.version,
  updated_at = NOW();

INSERT INTO public.mental_health_patients (
  patient_id,
  patient_name,
  patient_type,
  date_of_birth,
  sex,
  contact_number,
  guardian_contact
)
VALUES (
  'STU-1002',
  'Ella Tan',
  'student',
  DATE '2006-01-14',
  'Female',
  '09171001006',
  'Mila Tan - 09183001001'
)
ON CONFLICT (patient_id) DO UPDATE
SET
  patient_name = EXCLUDED.patient_name,
  patient_type = EXCLUDED.patient_type,
  date_of_birth = EXCLUDED.date_of_birth,
  sex = EXCLUDED.sex,
  contact_number = EXCLUDED.contact_number,
  guardian_contact = EXCLUDED.guardian_contact,
  updated_at = NOW();

INSERT INTO public.mental_health_sessions (
  case_reference,
  patient_id,
  patient_name,
  patient_type,
  counselor,
  session_type,
  status,
  risk_level,
  diagnosis_condition,
  treatment_plan,
  session_goals,
  session_duration_minutes,
  session_mode,
  location_room,
  guardian_contact,
  emergency_contact,
  medication_reference,
  follow_up_frequency,
  escalation_reason,
  outcome_result,
  assessment_score,
  assessment_tool,
  appointment_at,
  next_follow_up_at,
  created_by_role,
  is_draft
)
VALUES (
  'MHS-E2E-1001',
  'STU-1002',
  'Ella Tan',
  'student',
  'Dr. Rivera',
  'Initial Counseling',
  'follow_up',
  'medium',
  'Adjustment stress',
  'Counseling plus PMED endorsement follow-up',
  'Stabilize routine and complete pending wellness endorsement',
  50,
  'in_person',
  'Room MH-2',
  'Mila Tan - 09183001001',
  'Mila Tan - 09183001001',
  NULL,
  'Weekly',
  'Pending PMED medical clearance',
  'Needs another clinic-side follow-up',
  11,
  'PHQ-9',
  TIMESTAMP '2026-03-19 14:00:00',
  TIMESTAMP '2026-03-26 14:00:00',
  'Counselor',
  0
)
ON CONFLICT (case_reference) DO UPDATE
SET
  patient_name = EXCLUDED.patient_name,
  patient_type = EXCLUDED.patient_type,
  counselor = EXCLUDED.counselor,
  session_type = EXCLUDED.session_type,
  status = EXCLUDED.status,
  risk_level = EXCLUDED.risk_level,
  diagnosis_condition = EXCLUDED.diagnosis_condition,
  treatment_plan = EXCLUDED.treatment_plan,
  session_goals = EXCLUDED.session_goals,
  session_duration_minutes = EXCLUDED.session_duration_minutes,
  session_mode = EXCLUDED.session_mode,
  location_room = EXCLUDED.location_room,
  guardian_contact = EXCLUDED.guardian_contact,
  emergency_contact = EXCLUDED.emergency_contact,
  medication_reference = EXCLUDED.medication_reference,
  follow_up_frequency = EXCLUDED.follow_up_frequency,
  escalation_reason = EXCLUDED.escalation_reason,
  outcome_result = EXCLUDED.outcome_result,
  assessment_score = EXCLUDED.assessment_score,
  assessment_tool = EXCLUDED.assessment_tool,
  appointment_at = EXCLUDED.appointment_at,
  next_follow_up_at = EXCLUDED.next_follow_up_at,
  created_by_role = EXCLUDED.created_by_role,
  is_draft = EXCLUDED.is_draft,
  updated_at = NOW();

INSERT INTO public.pharmacy_medicines (
  medicine_code,
  sku,
  medicine_name,
  brand_name,
  generic_name,
  category,
  medicine_type,
  dosage_strength,
  unit_of_measure,
  supplier_name,
  purchase_cost,
  selling_price,
  batch_lot_no,
  manufacturing_date,
  expiry_date,
  storage_requirements,
  reorder_level,
  low_stock_threshold,
  stock_capacity,
  stock_on_hand,
  stock_location,
  barcode,
  is_archived
)
VALUES (
  'MED-E2E-1001',
  'SKU-E2E-1001',
  'Paracetamol',
  'Biogesic',
  'Paracetamol',
  'Tablet',
  'Analgesic',
  '500mg',
  'tabs',
  'MediCore Supply',
  2.50,
  5.00,
  'BATCH-E2E-1001',
  DATE '2025-12-01',
  DATE '2027-12-01',
  'Store below 25C',
  20,
  20,
  200,
  90,
  'Warehouse A / Shelf A1',
  '4800011111001',
  0
)
ON CONFLICT (sku) DO UPDATE
SET
  medicine_name = EXCLUDED.medicine_name,
  brand_name = EXCLUDED.brand_name,
  generic_name = EXCLUDED.generic_name,
  category = EXCLUDED.category,
  medicine_type = EXCLUDED.medicine_type,
  dosage_strength = EXCLUDED.dosage_strength,
  unit_of_measure = EXCLUDED.unit_of_measure,
  supplier_name = EXCLUDED.supplier_name,
  purchase_cost = EXCLUDED.purchase_cost,
  selling_price = EXCLUDED.selling_price,
  batch_lot_no = EXCLUDED.batch_lot_no,
  manufacturing_date = EXCLUDED.manufacturing_date,
  expiry_date = EXCLUDED.expiry_date,
  storage_requirements = EXCLUDED.storage_requirements,
  reorder_level = EXCLUDED.reorder_level,
  low_stock_threshold = EXCLUDED.low_stock_threshold,
  stock_capacity = EXCLUDED.stock_capacity,
  stock_on_hand = EXCLUDED.stock_on_hand,
  stock_location = EXCLUDED.stock_location,
  barcode = EXCLUDED.barcode,
  is_archived = EXCLUDED.is_archived,
  updated_at = NOW();

INSERT INTO public.pharmacy_dispense_requests (
  request_code,
  medicine_id,
  patient_name,
  quantity,
  notes,
  prescription_reference,
  dispense_reason,
  status,
  requested_at
)
SELECT
  'DSP-E2E-1001',
  pm.id,
  'Maria Santos',
  10,
  'Take every 6 hours as needed',
  'RX-E2E-1001',
  'Migraine symptom relief',
  'Pending',
  TIMESTAMP '2026-03-19 09:40:00'
FROM public.pharmacy_medicines pm
WHERE pm.sku = 'SKU-E2E-1001'
ON CONFLICT (request_code) DO UPDATE
SET
  medicine_id = EXCLUDED.medicine_id,
  patient_name = EXCLUDED.patient_name,
  quantity = EXCLUDED.quantity,
  notes = EXCLUDED.notes,
  prescription_reference = EXCLUDED.prescription_reference,
  dispense_reason = EXCLUDED.dispense_reason,
  status = EXCLUDED.status,
  requested_at = EXCLUDED.requested_at;

DELETE FROM public.module_activity_logs
WHERE entity_key IN (
  'APT-E2E-1001',
  'APT-E2E-1002',
  'MHS-E2E-1001',
  'E2E-SYNC'
)
  AND actor IN ('System Seed', 'Cashier Admin', 'Dr. Rivera');

INSERT INTO public.module_activity_logs (
  module,
  action,
  detail,
  actor,
  entity_type,
  entity_key,
  metadata,
  created_at
)
VALUES
  (
    'appointments',
    'BOOKING_CONFIRMED',
    'Appointment APT-E2E-1001 confirmed for Maria Santos after cashier verification.',
    'System Seed',
    'appointment',
    'APT-E2E-1001',
    jsonb_build_object('patient_type', 'student', 'cashier_status', 'paid'),
    TIMESTAMP '2026-03-19 09:10:00'
  ),
  (
    'cashier_integration',
    'PAYMENT_CAPTURED',
    'Cashier marked APT-E2E-1001 as paid and released for consultation.',
    'Cashier Admin',
    'cashier_payment',
    'APT-E2E-1001',
    jsonb_build_object('payment_status', 'paid', 'amount_due', 650.00),
    TIMESTAMP '2026-03-19 09:12:00'
  ),
  (
    'cashier_integration',
    'PAYMENT_PENDING',
    'Carlo Diaz still has a remaining balance before full release.',
    'Cashier Admin',
    'cashier_payment',
    'APT-E2E-1002',
    jsonb_build_object('payment_status', 'partial', 'balance_due', 550.00),
    TIMESTAMP '2026-03-19 09:20:00'
  ),
  (
    'mental_health',
    'FOLLOW_UP_SET',
    'Ella Tan requires counseling follow-up tied to PMED hold.',
    'Dr. Rivera',
    'mental_session',
    'MHS-E2E-1001',
    jsonb_build_object('risk_level', 'medium', 'patient_type', 'student'),
    TIMESTAMP '2026-03-19 14:05:00'
  ),
  (
    'patients',
    'PROFILE_SYNC_READY',
    'Module records are ready for patient master rebuild.',
    'System Seed',
    'patient_master',
    'E2E-SYNC',
    jsonb_build_object('source', 'supabase_seed'),
    TIMESTAMP '2026-03-19 14:10:00'
  )
ON CONFLICT DO NOTHING;

INSERT INTO clinic.cashier_integration_events (
  event_key,
  source_module,
  source_entity,
  source_key,
  patient_name,
  patient_type,
  reference_no,
  amount_due,
  currency_code,
  payment_status,
  sync_status,
  last_error,
  synced_at,
  payload,
  created_at,
  updated_at
)
VALUES
  (
    md5('appointments|appointment|APT-E2E-1001|APT-E2E-1001'),
    'appointments',
    'appointment',
    'APT-E2E-1001',
    'Maria Santos',
    'student',
    'APT-E2E-1001',
    650.00,
    'PHP',
    'paid',
    'acknowledged',
    NULL,
    TIMESTAMP '2026-03-19 09:12:00',
    jsonb_build_object('billing_code', 'CLN-E2E-1001', 'payment_method', 'Cash', 'doctor_name', 'Dr. Humour'),
    TIMESTAMP '2026-03-19 09:00:00',
    TIMESTAMP '2026-03-19 09:12:00'
  ),
  (
    md5('appointments|appointment|APT-E2E-1002|APT-E2E-1002'),
    'appointments',
    'appointment',
    'APT-E2E-1002',
    'Carlo Diaz',
    'teacher',
    'APT-E2E-1002',
    850.00,
    'PHP',
    'partial',
    'sent',
    NULL,
    TIMESTAMP '2026-03-19 09:20:00',
    jsonb_build_object('billing_code', 'CLN-E2E-1002', 'payment_method', 'Card', 'doctor_name', 'Dr. Humour'),
    TIMESTAMP '2026-03-19 09:05:00',
    TIMESTAMP '2026-03-19 09:20:00'
  ),
  (
    md5('appointments|appointment|APT-E2E-1003|APT-E2E-1003'),
    'appointments',
    'appointment',
    'APT-E2E-1003',
    'Ella Tan',
    'student',
    'APT-E2E-1003',
    1200.00,
    'PHP',
    'unpaid',
    'pending',
    NULL,
    NULL,
    jsonb_build_object('billing_code', 'CLN-E2E-1003', 'payment_method', 'HMA', 'doctor_name', 'Dr. Rivera'),
    TIMESTAMP '2026-03-19 09:15:00',
    TIMESTAMP '2026-03-19 09:15:00'
  )
ON CONFLICT (event_key) DO UPDATE
SET
  patient_name = EXCLUDED.patient_name,
  patient_type = EXCLUDED.patient_type,
  reference_no = EXCLUDED.reference_no,
  amount_due = EXCLUDED.amount_due,
  currency_code = EXCLUDED.currency_code,
  payment_status = EXCLUDED.payment_status,
  sync_status = EXCLUDED.sync_status,
  last_error = EXCLUDED.last_error,
  synced_at = EXCLUDED.synced_at,
  payload = EXCLUDED.payload,
  updated_at = EXCLUDED.updated_at;

INSERT INTO clinic.cashier_payment_links (
  source_module,
  source_key,
  cashier_reference,
  cashier_billing_id,
  invoice_number,
  official_receipt,
  amount_due,
  amount_paid,
  balance_due,
  payment_status,
  latest_payment_method,
  cashier_can_proceed,
  cashier_verified_at,
  paid_at,
  metadata,
  created_at,
  updated_at
)
VALUES
  (
    'appointments',
    'APT-E2E-1001',
    'CLN-E2E-1001',
    9001,
    'INV-E2E-1001',
    'OR-E2E-1001',
    650.00,
    650.00,
    0.00,
    'paid',
    'Cash',
    1,
    TIMESTAMP '2026-03-19 09:12:00',
    TIMESTAMP '2026-03-19 09:12:00',
    jsonb_build_object('cashier_user', 'Cashier Admin', 'seed', 'e2e'),
    TIMESTAMP '2026-03-19 09:00:00',
    TIMESTAMP '2026-03-19 09:12:00'
  ),
  (
    'appointments',
    'APT-E2E-1002',
    'CLN-E2E-1002',
    9002,
    'INV-E2E-1002',
    NULL,
    850.00,
    300.00,
    550.00,
    'partial',
    'Card',
    0,
    NULL,
    NULL,
    jsonb_build_object('cashier_user', 'Cashier Admin', 'seed', 'e2e'),
    TIMESTAMP '2026-03-19 09:05:00',
    TIMESTAMP '2026-03-19 09:20:00'
  ),
  (
    'appointments',
    'APT-E2E-1003',
    'CLN-E2E-1003',
    9003,
    'INV-E2E-1003',
    NULL,
    1200.00,
    0.00,
    1200.00,
    'unpaid',
    'HMA',
    0,
    NULL,
    NULL,
    jsonb_build_object('cashier_user', 'Cashier Admin', 'seed', 'e2e'),
    TIMESTAMP '2026-03-19 09:15:00',
    TIMESTAMP '2026-03-19 09:15:00'
  )
ON CONFLICT (source_module, source_key) DO UPDATE
SET
  cashier_reference = EXCLUDED.cashier_reference,
  cashier_billing_id = EXCLUDED.cashier_billing_id,
  invoice_number = EXCLUDED.invoice_number,
  official_receipt = EXCLUDED.official_receipt,
  amount_due = EXCLUDED.amount_due,
  amount_paid = EXCLUDED.amount_paid,
  balance_due = EXCLUDED.balance_due,
  payment_status = EXCLUDED.payment_status,
  latest_payment_method = EXCLUDED.latest_payment_method,
  cashier_can_proceed = EXCLUDED.cashier_can_proceed,
  cashier_verified_at = EXCLUDED.cashier_verified_at,
  paid_at = EXCLUDED.paid_at,
  metadata = EXCLUDED.metadata,
  updated_at = EXCLUDED.updated_at;

UPDATE public.patient_appointments a
SET
  cashier_billing_id = p.cashier_billing_id,
  cashier_billing_no = COALESCE(NULLIF(p.invoice_number, ''), NULLIF(p.cashier_reference, ''), a.cashier_billing_no),
  cashier_payment_status = COALESCE(NULLIF(p.payment_status, ''), a.cashier_payment_status),
  cashier_can_proceed = p.cashier_can_proceed,
  cashier_verified_at = p.cashier_verified_at,
  updated_at = NOW()
FROM clinic.cashier_payment_links p
WHERE p.source_module = 'appointments'
  AND p.source_key = a.booking_id
  AND a.booking_id IN ('APT-E2E-1001', 'APT-E2E-1002', 'APT-E2E-1003');

INSERT INTO clinic.department_flow_profiles (
  department_key,
  department_name,
  flow_order,
  clearance_stage_order,
  receives,
  sends,
  notes
)
VALUES
  (
    'registrar',
    'Registrar',
    1,
    9,
    jsonb_build_array(
      jsonb_build_object('message', 'Payment confirmation', 'from', 'cashier'),
      jsonb_build_object('message', 'Medical clearance', 'from', 'clinic'),
      jsonb_build_object('message', 'Counseling reports', 'from', 'guidance'),
      jsonb_build_object('message', 'Discipline records', 'from', 'prefect'),
      jsonb_build_object('message', 'Activity participation records', 'from', 'crad')
    ),
    jsonb_build_array(
      jsonb_build_object('message', 'Student enrollment data', 'to', 'cashier'),
      jsonb_build_object('message', 'Student personal information', 'to', 'clinic'),
      jsonb_build_object('message', 'Student personal information', 'to', 'guidance'),
      jsonb_build_object('message', 'Student personal information', 'to', 'prefect'),
      jsonb_build_object('message', 'Student academic records', 'to', 'guidance'),
      jsonb_build_object('message', 'Student list', 'to', 'comlab'),
      jsonb_build_object('message', 'Student list', 'to', 'crad'),
      jsonb_build_object('message', 'Enrollment statistics', 'to', 'pmed')
    ),
    'Final release point for the current handoff contract.'
  ),
  (
    'cashier',
    'Cashier',
    2,
    8,
    jsonb_build_array(
      jsonb_build_object('message', 'Student enrollment data', 'from', 'registrar'),
      jsonb_build_object('message', 'Payroll data', 'from', 'hr')
    ),
    jsonb_build_array(
      jsonb_build_object('message', 'Payment confirmation', 'to', 'registrar'),
      jsonb_build_object('message', 'Financial reports', 'to', 'pmed')
    ),
    'Handles payment verification and financial reporting.'
  ),
  (
    'clinic',
    'Clinic',
    3,
    3,
    jsonb_build_array(
      jsonb_build_object('message', 'Student personal information', 'from', 'registrar'),
      jsonb_build_object('message', 'Health incident reports', 'from', 'prefect')
    ),
    jsonb_build_array(
      jsonb_build_object('message', 'Medical clearance', 'to', 'registrar'),
      jsonb_build_object('message', 'Health reports', 'to', 'guidance'),
      jsonb_build_object('message', 'Health service reports', 'to', 'pmed')
    ),
    'Maintains the health clearance and service branch.'
  ),
  (
    'guidance',
    'Guidance Office',
    4,
    4,
    jsonb_build_array(
      jsonb_build_object('message', 'Student personal information', 'from', 'registrar'),
      jsonb_build_object('message', 'Student academic records', 'from', 'registrar')
    ),
    jsonb_build_array(
      jsonb_build_object('message', 'Counseling reports', 'to', 'registrar'),
      jsonb_build_object('message', 'Counseling reports', 'to', 'pmed'),
      jsonb_build_object('message', 'Health concerns', 'to', 'clinic'),
      jsonb_build_object('message', 'Discipline reports', 'to', 'prefect'),
      jsonb_build_object('message', 'Student recommendations', 'to', 'crad')
    ),
    'Tracks counseling and behavior-related concerns.'
  ),
  (
    'prefect',
    'Prefect Office',
    5,
    5,
    jsonb_build_array(
      jsonb_build_object('message', 'Student personal information', 'from', 'registrar')
    ),
    jsonb_build_array(
      jsonb_build_object('message', 'Discipline records', 'to', 'registrar'),
      jsonb_build_object('message', 'Discipline reports', 'to', 'guidance'),
      jsonb_build_object('message', 'Incident reports', 'to', 'clinic'),
      jsonb_build_object('message', 'Discipline statistics', 'to', 'pmed')
    ),
    'Handles discipline and incident handoffs.'
  ),
  (
    'comlab',
    'Computer Laboratory',
    6,
    6,
    jsonb_build_array(
      jsonb_build_object('message', 'Student list', 'from', 'registrar'),
      jsonb_build_object('message', 'Staff list', 'from', 'hr')
    ),
    jsonb_build_array(
      jsonb_build_object('message', 'Laboratory usage reports', 'to', 'pmed')
    ),
    'Computer laboratory reporting and accountability flow.'
  ),
  (
    'crad',
    'CRAD Department',
    7,
    7,
    jsonb_build_array(
      jsonb_build_object('message', 'Student list', 'from', 'registrar'),
      jsonb_build_object('message', 'Student recommendations', 'from', 'guidance')
    ),
    jsonb_build_array(
      jsonb_build_object('message', 'Activity participation records', 'to', 'registrar'),
      jsonb_build_object('message', 'Program activity reports', 'to', 'pmed')
    ),
    'Manages activity and program documentation.'
  ),
  (
    'hr',
    'HR Department',
    8,
    1,
    jsonb_build_array(
      jsonb_build_object('message', 'Staff evaluation feedback', 'from', 'pmed')
    ),
    jsonb_build_array(
      jsonb_build_object('message', 'Payroll data', 'to', 'cashier'),
      jsonb_build_object('message', 'Staff list', 'to', 'registrar'),
      jsonb_build_object('message', 'Staff list', 'to', 'comlab'),
      jsonb_build_object('message', 'Employee performance records', 'to', 'pmed')
    ),
    'Feeds payroll and personnel records.'
  ),
  (
    'pmed',
    'PMED Department',
    9,
    2,
    jsonb_build_array(
      jsonb_build_object('message', 'Enrollment statistics', 'from', 'registrar'),
      jsonb_build_object('message', 'Financial reports', 'from', 'cashier'),
      jsonb_build_object('message', 'Health service reports', 'from', 'clinic'),
      jsonb_build_object('message', 'Counseling reports', 'from', 'guidance'),
      jsonb_build_object('message', 'Discipline statistics', 'from', 'prefect'),
      jsonb_build_object('message', 'Laboratory usage reports', 'from', 'comlab'),
      jsonb_build_object('message', 'Program activity reports', 'from', 'crad'),
      jsonb_build_object('message', 'Employee performance reports', 'from', 'hr')
    ),
    jsonb_build_array(
      jsonb_build_object('message', 'Evaluation reports', 'to', 'school_admin'),
      jsonb_build_object('message', 'Staff evaluation feedback', 'to', 'hr')
    ),
    'Aggregates reports and returns evaluation summaries to School Administration.'
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

INSERT INTO clinic.department_clearance_records (
  clearance_reference,
  patient_id,
  patient_code,
  patient_name,
  patient_type,
  department_key,
  department_name,
  stage_order,
  status,
  remarks,
  requested_by,
  metadata
)
VALUES
  ('HR-STU-1001', 'STU-1001', 'STU-1001', 'Maria Santos', 'student', 'hr', 'HR Department', 1, 'approved', 'No HR blocker for student record.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'paid_and_released')),
  ('PMED-STU-1001', 'STU-1001', 'STU-1001', 'Maria Santos', 'student', 'pmed', 'PMED Department', 2, 'approved', 'Medical endorsement completed.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'paid_and_released')),
  ('CLINIC-STU-1001', 'STU-1001', 'STU-1001', 'Maria Santos', 'student', 'clinic', 'Clinic', 3, 'approved', 'Clinic release issued after payment verification.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'paid_and_released')),
  ('GUIDANCE-STU-1001', 'STU-1001', 'STU-1001', 'Maria Santos', 'student', 'guidance', 'Guidance Office', 4, 'approved', 'No counseling hold found.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'paid_and_released')),
  ('PREFECT-STU-1001', 'STU-1001', 'STU-1001', 'Maria Santos', 'student', 'prefect', 'Prefect Office', 5, 'approved', 'No disciplinary record found.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'paid_and_released')),
  ('COMLAB-STU-1001', 'STU-1001', 'STU-1001', 'Maria Santos', 'student', 'comlab', 'Computer Laboratory', 6, 'approved', 'No outstanding computer laboratory accountability.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'paid_and_released')),
  ('CRAD-STU-1001', 'STU-1001', 'STU-1001', 'Maria Santos', 'student', 'crad', 'CRAD Department', 7, 'approved', 'Program activity records complete.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'paid_and_released')),
  ('CASHIER-STU-1001', 'STU-1001', 'STU-1001', 'Maria Santos', 'student', 'cashier', 'Cashier', 8, 'approved', 'Cashier marked appointment as fully paid.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'paid_and_released', 'cashier_reference', 'CLN-E2E-1001')),
  ('REGISTRAR-STU-1001', 'STU-1001', 'STU-1001', 'Maria Santos', 'student', 'registrar', 'Registrar', 9, 'approved', 'Final release is ready.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'paid_and_released')),
  ('HR-EMP-2001', 'EMP-2001', 'EMP-2001', 'Carlo Diaz', 'teacher', 'hr', 'HR Department', 1, 'approved', 'Personnel file verified.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'partial_payment_hold')),
  ('PMED-EMP-2001', 'EMP-2001', 'EMP-2001', 'Carlo Diaz', 'teacher', 'pmed', 'PMED Department', 2, 'approved', 'Medical evaluation completed.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'partial_payment_hold')),
  ('CLINIC-EMP-2001', 'EMP-2001', 'EMP-2001', 'Carlo Diaz', 'teacher', 'clinic', 'Clinic', 3, 'approved', 'Clinic workup completed.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'partial_payment_hold')),
  ('GUIDANCE-EMP-2001', 'EMP-2001', 'EMP-2001', 'Carlo Diaz', 'teacher', 'guidance', 'Guidance Office', 4, 'approved', 'No pending guidance requirement.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'partial_payment_hold')),
  ('PREFECT-EMP-2001', 'EMP-2001', 'EMP-2001', 'Carlo Diaz', 'teacher', 'prefect', 'Prefect Office', 5, 'approved', 'No disciplinary blocker.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'partial_payment_hold')),
  ('COMLAB-EMP-2001', 'EMP-2001', 'EMP-2001', 'Carlo Diaz', 'teacher', 'comlab', 'Computer Laboratory', 6, 'approved', 'No lab accountability issue.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'partial_payment_hold')),
  ('CRAD-EMP-2001', 'EMP-2001', 'EMP-2001', 'Carlo Diaz', 'teacher', 'crad', 'CRAD Department', 7, 'approved', 'Program documents submitted.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'partial_payment_hold')),
  ('CASHIER-EMP-2001', 'EMP-2001', 'EMP-2001', 'Carlo Diaz', 'teacher', 'cashier', 'Cashier', 8, 'pending', 'Outstanding balance remains at cashier.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'partial_payment_hold', 'cashier_reference', 'CLN-E2E-1002')),
  ('REGISTRAR-EMP-2001', 'EMP-2001', 'EMP-2001', 'Carlo Diaz', 'teacher', 'registrar', 'Registrar', 9, 'pending', 'Registrar release is blocked until cashier clears the remaining balance.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'partial_payment_hold')),
  ('HR-STU-1002', 'STU-1002', 'STU-1002', 'Ella Tan', 'student', 'hr', 'HR Department', 1, 'approved', 'No HR blocker.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'upstream_hold')),
  ('PMED-STU-1002', 'STU-1002', 'STU-1002', 'Ella Tan', 'student', 'pmed', 'PMED Department', 2, 'hold', 'Awaiting updated wellness endorsement.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'upstream_hold')),
  ('CLINIC-STU-1002', 'STU-1002', 'STU-1002', 'Ella Tan', 'student', 'clinic', 'Clinic', 3, 'pending', 'Pending PMED release before clinic release.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'upstream_hold')),
  ('GUIDANCE-STU-1002', 'STU-1002', 'STU-1002', 'Ella Tan', 'student', 'guidance', 'Guidance Office', 4, 'pending', 'Counseling follow-up remains open.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'upstream_hold')),
  ('PREFECT-STU-1002', 'STU-1002', 'STU-1002', 'Ella Tan', 'student', 'prefect', 'Prefect Office', 5, 'pending', 'Waiting for upstream departments.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'upstream_hold')),
  ('COMLAB-STU-1002', 'STU-1002', 'STU-1002', 'Ella Tan', 'student', 'comlab', 'Computer Laboratory', 6, 'pending', 'Waiting for upstream departments.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'upstream_hold')),
  ('CRAD-STU-1002', 'STU-1002', 'STU-1002', 'Ella Tan', 'student', 'crad', 'CRAD Department', 7, 'pending', 'Waiting for upstream departments.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'upstream_hold')),
  ('CASHIER-STU-1002', 'STU-1002', 'STU-1002', 'Ella Tan', 'student', 'cashier', 'Cashier', 8, 'pending', 'Cashier queue is prepared but upstream release is incomplete.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'upstream_hold', 'cashier_reference', 'CLN-E2E-1003')),
  ('REGISTRAR-STU-1002', 'STU-1002', 'STU-1002', 'Ella Tan', 'student', 'registrar', 'Registrar', 9, 'pending', 'Final release locked while PMED and clinic remain incomplete.', 'Supabase E2E Seed', jsonb_build_object('scenario', 'upstream_hold'))
ON CONFLICT (clearance_reference) DO UPDATE
SET
  patient_id = EXCLUDED.patient_id,
  patient_code = EXCLUDED.patient_code,
  patient_name = EXCLUDED.patient_name,
  patient_type = EXCLUDED.patient_type,
  department_key = EXCLUDED.department_key,
  department_name = EXCLUDED.department_name,
  stage_order = EXCLUDED.stage_order,
  status = EXCLUDED.status,
  remarks = EXCLUDED.remarks,
  requested_by = EXCLUDED.requested_by,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

COMMIT;
