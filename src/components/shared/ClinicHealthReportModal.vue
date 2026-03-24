<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import {
  createAndSendHealthReport,
  type CreateHealthReportInput,
  type HealthReportSeverity,
  type MedicineEntry
} from '@/services/clinicHealthReports';
import { fetchAdminProfile } from '@/services/adminProfile';
import { listDoctors, type DoctorRow } from '@/services/doctors';
import { fetchPatientsSnapshot, type PatientRecord } from '@/services/patientsDatabase';
import { fetchApiData } from '@/services/apiClient';
import { listRegistrarPeople, type RegistrarDirectoryPerson } from '@/services/registrarDirectory';

// ── Types ─────────────────────────────────────────────────────────────────────
type PharmacyMedicineOption = {
  id: number;
  name: string;
  genericName: string;
  dosageStrength: string;
  category: string;
  stock: number;
  unit: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const SEVERITY_OPTIONS: { label: string; value: HealthReportSeverity; color: string; icon: string }[] = [
  { label: 'Low',       value: 'low',       color: 'success', icon: 'mdi-check-circle-outline' },
  { label: 'Moderate',  value: 'moderate',  color: 'warning', icon: 'mdi-alert-circle-outline' },
  { label: 'High',      value: 'high',      color: 'error',   icon: 'mdi-alert-outline' },
  { label: 'Emergency', value: 'emergency', color: 'error',   icon: 'mdi-ambulance' }
];
const STUDENT_TYPES = [
  { title: 'Student',        value: 'student' },
  { title: 'Teacher / Staff', value: 'teacher' }
];
const SEX_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];

// ── Emits / model ─────────────────────────────────────────────────────────────
const model = defineModel<boolean>({ default: false });
const emit = defineEmits<{ (e: 'submitted', code: string): void }>();

// ── Form state ────────────────────────────────────────────────────────────────
function emptyMedicine(): MedicineEntry {
  return { name: '', dose: '', quantity: '', notes: '' };
}

function emptyForm(): CreateHealthReportInput {
  return {
    studentId: '',
    studentName: '',
    studentType: 'student',
    gradeSection: '',
    age: null,
    sex: '',
    healthIssue: '',
    symptoms: '',
    severity: 'low',
    treatmentGiven: '',
    medicinesUsed: [emptyMedicine()],
    firstAidGiven: '',
    attendingStaff: '',
    remarks: ''
  };
}

const form = reactive<CreateHealthReportInput>(emptyForm());
const submitting = ref(false);
const errorText = ref('');
const step = ref<1 | 2>(1);

// Field-level error flags
const nameError = ref('');
const healthIssueError = ref('');
const modalBodyRef = ref<HTMLElement | null>(null);

function scrollToError(): void {
  setTimeout(() => {
    const el = modalBodyRef.value?.querySelector('.field-error-anchor') as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 60);
}

// Clear field errors as user types
watch(() => form.studentName,  () => { if (form.studentName?.trim()) nameError.value = ''; });
watch(() => form.healthIssue,  () => { if (form.healthIssue?.trim()) healthIssueError.value = ''; });

// ── Student ID lookup ─────────────────────────────────────────────────────────
const idLookupStatus = ref<'idle' | 'loading' | 'found' | 'not_found'>('idle');
const idLookupHint = ref('');
let idLookupTimer: ReturnType<typeof setTimeout> | null = null;

async function lookupStudentId(rawId: string): Promise<void> {
  const id = rawId.trim();
  if (!id) {
    idLookupStatus.value = 'idle';
    idLookupHint.value = '';
    return;
  }

  idLookupStatus.value = 'loading';
  idLookupHint.value = 'Looking up ID…';

  try {
    // ① Try patient_master (fastest — same DB)
    const snapshot = await fetchPatientsSnapshot({ search: id, perPage: 5, page: 1 });
    const patients: PatientRecord[] = snapshot?.items ?? [];

    // Exact match on patient_code first, then partial
    const exact = patients.find(
      (p) => p.patient_code.toLowerCase() === id.toLowerCase()
    );
    const match: PatientRecord | undefined = exact ?? patients[0];

    if (match) {
      form.studentName   = match.patient_name;
      form.studentType   = match.patient_type === 'teacher' ? 'teacher' : 'student';
      form.age           = match.age ?? null;
      form.sex           = match.sex ?? '';
      // gradeSection is not in patient_master — leave as-is unless cleared
      idLookupStatus.value = 'found';
      idLookupHint.value = `Found in patient records: ${match.patient_name}`;
      return;
    }

    // ② Try registrar directory (student_no / employee_no)
    const regStudents = await listRegistrarPeople('student');
    const regMatch = regStudents.find(
      (p: RegistrarDirectoryPerson) => p.code.toLowerCase() === id.toLowerCase()
    );
    if (regMatch) {
      form.studentName  = regMatch.fullName;
      form.studentType  = 'student';
      form.gradeSection = [regMatch.program, regMatch.yearLevel].filter(Boolean).join(' - ');
      idLookupStatus.value = 'found';
      idLookupHint.value = `Found in Registrar: ${regMatch.fullName}`;
      return;
    }

    // ③ Try teacher directory
    const regTeachers = await listRegistrarPeople('teacher');
    const teacherMatch = regTeachers.find(
      (p: RegistrarDirectoryPerson) => p.code.toLowerCase() === id.toLowerCase()
    );
    if (teacherMatch) {
      form.studentName  = teacherMatch.fullName;
      form.studentType  = 'teacher';
      form.gradeSection = teacherMatch.department ?? '';
      idLookupStatus.value = 'found';
      idLookupHint.value = `Found in Registrar (Staff): ${teacherMatch.fullName}`;
      return;
    }

    idLookupStatus.value = 'not_found';
    idLookupHint.value = 'ID not found — you can still fill in the details manually.';
  } catch {
    idLookupStatus.value = 'not_found';
    idLookupHint.value = 'Lookup failed — please fill in the details manually.';
  }
}

watch(
  () => form.studentId,
  (val) => {
    if (idLookupTimer) clearTimeout(idLookupTimer);
    if (!val?.trim()) {
      idLookupStatus.value = 'idle';
      idLookupHint.value = '';
      return;
    }
    idLookupTimer = setTimeout(() => void lookupStudentId(val), 500);
  }
);

// ── Doctor / nurse auto-fill ──────────────────────────────────────────────────
const doctorOptions = ref<string[]>([]);
const doctorLoading = ref(false);

async function loadDoctorsAndProfile(): Promise<void> {
  doctorLoading.value = true;
  try {
    const [doctorRows, profile] = await Promise.all([
      listDoctors({ includeInactive: false }),
      fetchAdminProfile()
    ]);

    // Build list: doctors first, then logged-in admin if not already there
    const names = doctorRows.map((d: DoctorRow) => d.doctorName);
    const loggedInName = profile?.profile?.fullName?.trim();
    if (loggedInName && !names.includes(loggedInName)) {
      names.unshift(loggedInName);
    }
    doctorOptions.value = names;

    // Pre-fill with the logged-in user's name if the field is empty
    if (!form.attendingStaff && loggedInName) {
      form.attendingStaff = loggedInName;
    }
  } catch {
    // Non-fatal: staff can still type manually
  } finally {
    doctorLoading.value = false;
  }
}

// ── Pharmacy medicine autocomplete ───────────────────────────────────────────
const allMedicines = ref<PharmacyMedicineOption[]>([]);
const medicinesLoading = ref(false);

async function loadPharmacyMedicines(): Promise<void> {
  medicinesLoading.value = true;
  try {
    const data = await fetchApiData<{
      ok?: boolean;
      data?: { medicines?: Array<Record<string, unknown>> };
      medicines?: Array<Record<string, unknown>>;
    }>('/api/pharmacy', { ttlMs: 60_000 });

    const raw: Array<Record<string, unknown>> =
      (data as any)?.data?.medicines ??
      (data as any)?.medicines ??
      [];

    allMedicines.value = raw
      .filter((r) => Number(r.stock ?? r.stock_on_hand ?? 0) > 0)
      .map((r) => ({
        id:             Number(r.id ?? 0),
        name:           String(r.medicine_name ?? r.name ?? ''),
        genericName:    String(r.generic_name ?? r.genericName ?? ''),
        dosageStrength: String(r.dosage_strength ?? r.dosageStrength ?? ''),
        category:       String(r.category ?? ''),
        stock:          Number(r.stock ?? r.stock_on_hand ?? 0),
        unit:           String(r.unit_of_measure ?? r.unit ?? 'pc')
      }))
      .filter((r) => r.name);
  } catch {
    // Medicines are optional — manual entry still works
  } finally {
    medicinesLoading.value = false;
  }
}

function medicineLabel(m: PharmacyMedicineOption): string {
  const parts = [m.name];
  if (m.dosageStrength) parts.push(`(${m.dosageStrength})`);
  if (m.stock > 0) parts.push(`· ${m.stock} ${m.unit} in stock`);
  return parts.join(' ');
}

function onMedicineSelected(idx: number, selectedName: string): void {
  const med = allMedicines.value.find((m) => m.name === selectedName);
  if (!med) return;
  const entry = form.medicinesUsed?.[idx];
  if (!entry) return;
  entry.name = med.name;
  if (!entry.dose && med.dosageStrength) {
    entry.dose = med.dosageStrength;
  }
}

// ── Medicine list helpers ─────────────────────────────────────────────────────
function addMedicine(): void {
  if (!form.medicinesUsed) form.medicinesUsed = [];
  form.medicinesUsed.push(emptyMedicine());
}

function removeMedicine(index: number): void {
  form.medicinesUsed?.splice(index, 1);
}

function hasMedicines(): boolean {
  return (form.medicinesUsed ?? []).some((m) => m.name.trim() !== '');
}

// ── Misc helpers ──────────────────────────────────────────────────────────────
function severityColor(value: HealthReportSeverity): string {
  return SEVERITY_OPTIONS.find((o) => o.value === value)?.color ?? 'grey';
}

// ── Open/reset ────────────────────────────────────────────────────────────────
watch(model, (open) => {
  if (!open) return;
  Object.assign(form, emptyForm());
  errorText.value = '';
  nameError.value = '';
  healthIssueError.value = '';
  step.value = 1;
  idLookupStatus.value = 'idle';
  idLookupHint.value = '';
  void loadDoctorsAndProfile();
});

// ── Step 1 → Step 2 (with validation) ────────────────────────────────────────
function goToStep2(): void {
  nameError.value = '';
  healthIssueError.value = '';
  errorText.value = '';

  let hasError = false;

  if (!form.studentName?.trim()) {
    nameError.value = 'Patient name is required before continuing.';
    hasError = true;
  }
  if (!form.healthIssue?.trim()) {
    healthIssueError.value = 'Please describe the health issue before continuing.';
    hasError = true;
  }

  if (hasError) {
    scrollToError();
    return;
  }

  step.value = 2;
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function submit(): Promise<void> {
  errorText.value = '';
  nameError.value = '';
  healthIssueError.value = '';

  let hasError = false;
  if (!form.studentName?.trim()) {
    nameError.value = 'Patient name is required.';
    hasError = true;
  }
  if (!form.healthIssue?.trim()) {
    healthIssueError.value = 'Please describe the health issue.';
    hasError = true;
  }
  if (hasError) {
    step.value = 1;
    scrollToError();
    return;
  }

  submitting.value = true;
  try {
    const result = await createAndSendHealthReport({
      ...form,
      medicinesUsed: (form.medicinesUsed ?? []).filter((m) => m.name.trim() !== '')
    });
    model.value = false;
    emit('submitted', result.reportCode);
  } catch (err) {
    errorText.value = err instanceof Error ? err.message : String(err);
  } finally {
    submitting.value = false;
  }
}

function close(): void {
  model.value = false;
}

// Load medicines as soon as component mounts (pre-cache)
onMounted(() => {
  void loadPharmacyMedicines();
});
</script>

<template>
  <v-dialog v-model="model" max-width="800" scrollable persistent>
    <v-card class="health-report-modal" rounded="xl">

      <!-- ── Header ──────────────────────────────────────────────────────── -->
      <div class="modal-header">
        <div class="modal-header-icon">
          <v-icon size="28" color="white">mdi-medical-bag</v-icon>
        </div>
        <div class="modal-header-text">
          <div class="modal-kicker">Clinic → PMED</div>
          <h2 class="modal-title">Student Health Issue Report</h2>
          <p class="modal-subtitle">Enter the Student ID to auto-fill patient info, then document the issue and treatment.</p>
        </div>
        <v-btn icon variant="text" class="modal-close-btn" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>

      <!-- ── Step tabs ───────────────────────────────────────────────────── -->
      <div class="step-tabs px-6 pt-3 pb-0">
        <v-btn-toggle v-model="step" mandatory density="compact" color="primary" variant="outlined" rounded="lg">
          <v-btn :value="1" class="step-btn">
            <v-icon size="16" class="mr-1">mdi-account-details</v-icon>
            Patient &amp; Health Issue
          </v-btn>
          <v-btn :value="2" class="step-btn">
            <v-icon size="16" class="mr-1">mdi-pill</v-icon>
            Treatment &amp; Medicine
          </v-btn>
        </v-btn-toggle>
      </div>
      <v-divider class="mt-3" />

      <!-- ── Body ───────────────────────────────────────────────────────── -->
      <v-card-text ref="modalBodyRef" class="modal-body">

        <!-- STEP 1 ─────────────────────────────────────────────────────── -->
        <div v-show="step === 1" class="form-section">

          <!-- ID lookup row -->
          <div class="section-heading">
            <v-icon color="primary" size="18">mdi-account-search</v-icon>
            Student / Employee ID Lookup
          </div>

          <v-row dense class="mb-1">
            <v-col cols="12" sm="5">
              <v-text-field
                v-model="form.studentId"
                label="Student / Employee ID"
                placeholder="e.g. 2023-12345"
                variant="outlined"
                density="compact"
                :prepend-inner-icon="idLookupStatus === 'loading' ? '' : 'mdi-identifier'"
                :loading="idLookupStatus === 'loading'"
                :color="idLookupStatus === 'found' ? 'success' : idLookupStatus === 'not_found' ? 'warning' : undefined"
                clearable
                @click:clear="idLookupStatus = 'idle'; idLookupHint = ''"
              />
            </v-col>
            <v-col cols="12" sm="7" class="d-flex align-center pb-5">
              <div v-if="idLookupStatus === 'loading'" class="lookup-hint lookup-loading">
                <v-progress-circular size="14" width="2" indeterminate color="primary" class="mr-2" />
                Searching records…
              </div>
              <div v-else-if="idLookupStatus === 'found'" class="lookup-hint lookup-found">
                <v-icon size="16" color="success" class="mr-1">mdi-check-circle</v-icon>
                {{ idLookupHint }}
              </div>
              <div v-else-if="idLookupStatus === 'not_found'" class="lookup-hint lookup-not-found">
                <v-icon size="16" color="warning" class="mr-1">mdi-alert-circle-outline</v-icon>
                {{ idLookupHint }}
              </div>
              <div v-else class="lookup-hint lookup-idle">
                <v-icon size="16" color="grey" class="mr-1">mdi-information-outline</v-icon>
                Type a Student/Employee ID — fields will fill automatically.
              </div>
            </v-col>
          </v-row>

          <!-- Auto-filled patient info banner -->
          <div v-if="idLookupStatus === 'found'" class="autofill-banner mb-3">
            <v-icon size="15" color="success" class="mr-1">mdi-auto-fix</v-icon>
            Fields below were auto-filled from the records. Review and edit if needed.
          </div>

          <v-divider class="mb-4" />

          <!-- Patient details (auto-filled or manual) -->
          <div class="section-heading">
            <v-icon color="primary" size="18">mdi-account-heart</v-icon>
            Patient Information
          </div>
          <v-row dense>
            <v-col cols="12" sm="8">
              <div :class="{ 'field-error-anchor': !!nameError }">
                <v-text-field
                  v-model="form.studentName"
                  label="Full Name *"
                  placeholder="e.g. Juan dela Cruz"
                  variant="outlined"
                  density="compact"
                  prepend-inner-icon="mdi-account"
                  :readonly="idLookupStatus === 'found'"
                  :bg-color="idLookupStatus === 'found' ? 'green-lighten-5' : undefined"
                  :error="!!nameError"
                  :error-messages="nameError"
                />
              </div>
            </v-col>
            <v-col cols="12" sm="4">
              <v-select
                v-model="form.studentType"
                label="Type"
                :items="STUDENT_TYPES"
                item-title="title"
                item-value="value"
                variant="outlined"
                density="compact"
                prepend-inner-icon="mdi-badge-account-outline"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="form.gradeSection"
                label="Grade / Section / Dept."
                placeholder="e.g. Grade 10 - Mabini"
                variant="outlined"
                density="compact"
                prepend-inner-icon="mdi-school"
              />
            </v-col>
            <v-col cols="6" sm="2">
              <v-text-field
                v-model.number="form.age"
                label="Age"
                type="number"
                variant="outlined"
                density="compact"
                prepend-inner-icon="mdi-numeric"
                :min="1"
                :max="120"
                :bg-color="idLookupStatus === 'found' && form.age ? 'green-lighten-5' : undefined"
              />
            </v-col>
            <v-col cols="6" sm="2">
              <v-select
                v-model="form.sex"
                label="Sex"
                :items="SEX_OPTIONS"
                variant="outlined"
                density="compact"
                clearable
                :bg-color="idLookupStatus === 'found' && form.sex ? 'green-lighten-5' : undefined"
              />
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <!-- Health Issue -->
          <div class="section-heading">
            <v-icon color="error" size="18">mdi-hospital-box</v-icon>
            Health Issue Details
          </div>
          <v-row dense>
            <v-col cols="12">
              <div :class="{ 'field-error-anchor': !!healthIssueError }">
                <v-textarea
                  v-model="form.healthIssue"
                  label="Health Issue / Chief Complaint *"
                  placeholder="Describe what happened or what the patient is complaining about…"
                  variant="outlined"
                  density="compact"
                  rows="3"
                  auto-grow
                  prepend-inner-icon="mdi-stethoscope"
                  :error="!!healthIssueError"
                  :error-messages="healthIssueError"
                />
              </div>
            </v-col>
            <v-col cols="12">
              <v-textarea
                v-model="form.symptoms"
                label="Symptoms Observed"
                placeholder="e.g. fever 38.5°C, headache, nausea, dizziness…"
                variant="outlined"
                density="compact"
                rows="2"
                auto-grow
                prepend-inner-icon="mdi-thermometer"
              />
            </v-col>
            <v-col cols="12">
              <div class="text-body-2 font-weight-bold mb-2 text-medium-emphasis">Severity Level</div>
              <div class="d-flex flex-wrap ga-2">
                <v-btn
                  v-for="opt in SEVERITY_OPTIONS"
                  :key="opt.value"
                  :color="form.severity === opt.value ? opt.color : 'default'"
                  :variant="form.severity === opt.value ? 'flat' : 'outlined'"
                  size="small"
                  rounded="lg"
                  :prepend-icon="opt.icon"
                  @click="form.severity = opt.value"
                >
                  {{ opt.label }}
                </v-btn>
              </div>
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <!-- Attending staff (auto-filled from admin profile) -->
          <div class="section-heading">
            <v-icon color="teal" size="18">mdi-nurse</v-icon>
            Attending Staff
            <v-chip v-if="!doctorLoading && form.attendingStaff" size="x-small" color="teal" variant="tonal" class="ml-2">
              Auto-filled
            </v-chip>
          </div>
          <v-row dense>
            <v-col cols="12" sm="8">
              <v-autocomplete
                v-model="form.attendingStaff"
                label="Attending Nurse / Doctor *"
                :items="doctorOptions"
                variant="outlined"
                density="compact"
                prepend-inner-icon="mdi-stethoscope"
                :loading="doctorLoading"
                clearable
                auto-select-first
                no-data-text="No doctors on record — type name manually."
                :bg-color="form.attendingStaff ? 'teal-lighten-5' : undefined"
                hint="Pre-filled from your login. Change if a different staff is attending."
                persistent-hint
              />
            </v-col>
          </v-row>
        </div>

        <!-- STEP 2 ─────────────────────────────────────────────────────── -->
        <div v-show="step === 2" class="form-section">

          <!-- First Aid -->
          <div class="section-heading">
            <v-icon color="green" size="18">mdi-bandage</v-icon>
            First Aid Given
          </div>
          <v-row dense>
            <v-col cols="12">
              <v-textarea
                v-model="form.firstAidGiven"
                label="First Aid / Immediate Response"
                placeholder="e.g. Applied cold compress, advised to rest, monitored vital signs…"
                variant="outlined"
                density="compact"
                rows="2"
                auto-grow
                prepend-inner-icon="mdi-first-aid"
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                v-model="form.treatmentGiven"
                label="Treatment / Clinical Notes"
                placeholder="e.g. Patient was given oral rehydration. Referred to physician for further assessment…"
                variant="outlined"
                density="compact"
                rows="3"
                auto-grow
                prepend-inner-icon="mdi-clipboard-pulse"
              />
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <!-- Medicines -->
          <div class="d-flex justify-space-between align-center mb-3">
            <div class="section-heading mb-0">
              <v-icon color="indigo" size="18">mdi-pill</v-icon>
              Medicines / Supplies Used
              <v-chip v-if="allMedicines.length" size="x-small" color="indigo" variant="tonal" class="ml-2">
                {{ allMedicines.length }} in pharmacy
              </v-chip>
            </div>
            <v-btn
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-plus"
              @click="addMedicine"
            >
              Add Row
            </v-btn>
          </div>

          <div class="medicines-list">
            <div
              v-for="(med, idx) in (form.medicinesUsed ?? [])"
              :key="idx"
              class="medicine-row"
            >
              <div class="medicine-row-number">{{ idx + 1 }}</div>
              <v-row dense class="flex-grow-1">
                <v-col cols="12" sm="5">
                  <!-- Autocomplete from pharmacy if medicines loaded, else plain text -->
                  <v-autocomplete
                    v-if="allMedicines.length"
                    v-model="med.name"
                    :items="allMedicines"
                    :item-title="medicineLabel"
                    item-value="name"
                    label="Medicine / Supply"
                    placeholder="Search pharmacy…"
                    variant="outlined"
                    density="compact"
                    hide-details
                    clearable
                    auto-select-first
                    no-data-text="Not in pharmacy — type name."
                    :loading="medicinesLoading"
                    @update:model-value="onMedicineSelected(idx, med.name)"
                  />
                  <v-text-field
                    v-else
                    v-model="med.name"
                    label="Medicine / Supply Name"
                    placeholder="e.g. Paracetamol 500mg"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                </v-col>
                <v-col cols="6" sm="3">
                  <v-text-field
                    v-model="med.dose"
                    label="Dose / Instructions"
                    placeholder="e.g. 1 tablet"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                </v-col>
                <v-col cols="4" sm="2">
                  <v-text-field
                    v-model="med.quantity"
                    label="Qty"
                    placeholder="e.g. 2"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                </v-col>
                <v-col cols="2" sm="2" class="d-flex align-center justify-center">
                  <v-btn
                    icon
                    size="small"
                    color="error"
                    variant="text"
                    :disabled="(form.medicinesUsed?.length ?? 0) <= 1"
                    @click="removeMedicine(idx)"
                  >
                    <v-icon>mdi-trash-can-outline</v-icon>
                  </v-btn>
                </v-col>
              </v-row>
            </div>
            <div v-if="!hasMedicines()" class="no-medicines-note text-medium-emphasis text-body-2">
              <v-icon size="16" class="mr-1">mdi-information-outline</v-icon>
              No medicines listed. Search from the pharmacy dropdown or leave blank.
            </div>
          </div>

          <v-divider class="my-4" />

          <div class="section-heading">
            <v-icon color="grey" size="18">mdi-note-text</v-icon>
            Additional Remarks
          </div>
          <v-row dense>
            <v-col cols="12">
              <v-textarea
                v-model="form.remarks"
                label="Remarks / Follow-up Notes"
                placeholder="e.g. Patient advised to rest and follow up if symptoms persist…"
                variant="outlined"
                density="compact"
                rows="2"
                auto-grow
                prepend-inner-icon="mdi-comment-text-outline"
              />
            </v-col>
          </v-row>
        </div>

        <!-- Server / network error only -->
        <v-alert v-if="errorText" type="error" variant="tonal" class="mt-3" density="compact" closable @click:close="errorText = ''">
          {{ errorText }}
        </v-alert>

        <!-- Summary row -->
        <div v-if="form.studentName || form.severity" class="summary-row mt-3">
          <v-chip v-if="form.studentName" size="small" variant="tonal" color="primary" prepend-icon="mdi-account">
            {{ form.studentName }}
          </v-chip>
          <v-chip v-if="form.gradeSection" size="small" variant="tonal" color="info" prepend-icon="mdi-school">
            {{ form.gradeSection }}
          </v-chip>
          <v-chip v-if="form.age" size="small" variant="tonal" color="secondary" prepend-inner-icon="mdi-numeric">
            Age {{ form.age }}
          </v-chip>
          <v-chip
            v-if="form.severity"
            size="small"
            variant="flat"
            :color="severityColor(form.severity as HealthReportSeverity)"
            prepend-icon="mdi-alert-circle-outline"
          >
            {{ form.severity }}
          </v-chip>
          <v-chip v-if="form.attendingStaff" size="small" variant="tonal" color="teal" prepend-icon="mdi-nurse">
            {{ form.attendingStaff }}
          </v-chip>
          <v-chip v-if="hasMedicines()" size="small" variant="tonal" color="indigo" prepend-icon="mdi-pill">
            {{ (form.medicinesUsed ?? []).filter(m => m.name.trim()).length }} medicine(s)
          </v-chip>
        </div>
      </v-card-text>

      <v-divider />

      <!-- Footer -->
      <v-card-actions class="modal-footer">
        <div class="pmed-badge">
          <v-icon size="14" color="primary" class="mr-1">mdi-send-check</v-icon>
          Will be sent directly to PMED
        </div>
        <v-spacer />
        <v-btn variant="text" :disabled="submitting" @click="close">Cancel</v-btn>
        <v-btn
          v-if="step === 1"
          color="primary"
          variant="flat"
          rounded="lg"
          append-icon="mdi-arrow-right"
          @click="goToStep2"
        >
          Next: Treatment
        </v-btn>
        <v-btn
          v-else
          color="success"
          variant="flat"
          rounded="lg"
          prepend-icon="mdi-send"
          :loading="submitting"
          @click="submit"
        >
          Submit &amp; Send to PMED
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.health-report-modal { overflow: hidden; }

.modal-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 24px 24px 20px;
  background: linear-gradient(120deg, #124170 0%, #1565c0 60%, #00897b 100%);
  color: #fff;
  position: relative;
}
.modal-header-icon {
  width: 52px; height: 52px;
  border-radius: 14px;
  background: rgba(255,255,255,.18);
  border: 1.5px solid rgba(255,255,255,.3);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.modal-header-text { flex: 1; min-width: 0; }
.modal-kicker {
  font-size: 11px; font-weight: 700; letter-spacing: .8px;
  text-transform: uppercase; opacity: .78; margin-bottom: 4px;
}
.modal-title { font-size: 20px; font-weight: 800; line-height: 1.2; margin: 0 0 4px; }
.modal-subtitle { font-size: 13px; opacity: .85; margin: 0; }
.modal-close-btn { color: rgba(255,255,255,.8) !important; position: absolute; top: 12px; right: 12px; }

.step-tabs { background: transparent; }
.step-btn { text-transform: none !important; font-size: 13px !important; font-weight: 600 !important; }

.modal-body { padding: 20px 24px; overflow-y: auto; max-height: 60vh; }

.form-section { display: flex; flex-direction: column; gap: 0; }

.section-heading {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .5px;
  color: rgba(0,0,0,.6); margin-bottom: 12px;
}

/* ID Lookup hints */
.lookup-hint { display: flex; align-items: center; font-size: 13px; }
.lookup-loading { color: #1565c0; }
.lookup-found   { color: #2e7d32; font-weight: 600; }
.lookup-not-found { color: #e65100; }
.lookup-idle    { color: rgba(0,0,0,.45); }

/* Auto-fill banner */
.autofill-banner {
  display: flex; align-items: center;
  padding: 8px 14px;
  background: #e8f5e9;
  border: 1px solid #a5d6a7;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #2e7d32;
}

/* Medicines */
.medicines-list { display: flex; flex-direction: column; gap: 10px; }
.medicine-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px;
  background: #f8fbff;
  border: 1px solid #d7e4ff;
  border-radius: 10px;
}
.medicine-row-number {
  width: 24px; height: 24px; border-radius: 50%;
  background: #1565c0; color: #fff;
  font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-top: 6px;
}
.no-medicines-note {
  padding: 12px 14px;
  border: 1px dashed #c5cae9;
  border-radius: 10px;
  background: #f3f4ff;
}

/* Summary row */
.summary-row {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 10px 14px;
  background: rgba(21,101,192,.05);
  border: 1px solid rgba(21,101,192,.12);
  border-radius: 10px;
}

.modal-footer { padding: 14px 24px; background: #f8faff; }
.pmed-badge {
  display: flex; align-items: center;
  font-size: 12px; font-weight: 600; color: #1565c0;
  padding: 4px 10px;
  background: rgba(21,101,192,.08);
  border-radius: 999px;
}
</style>
