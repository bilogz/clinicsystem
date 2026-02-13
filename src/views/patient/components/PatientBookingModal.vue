<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import SaasDateTimePickerField from '@/components/shared/SaasDateTimePickerField.vue';
import { createAppointment, type CreateAppointmentPayload } from '@/services/appointmentsAdmin';

type CreateStep = 1 | 2 | 3;

const model = defineModel<boolean>({ default: false });
const props = defineProps<{
  patientContext?: {
    patientCode?: string;
    fullName?: string;
    email?: string;
    phoneNumber?: string;
    sex?: string | null;
  } | null;
}>();

const departmentDoctorMap: Record<string, string[]> = {
  'General Medicine': ['Dr. Humour', 'Dr. Jenni'],
  Pediatrics: ['Dr. Rivera', 'Dr. Humour'],
  Orthopedic: ['Dr. Morco', 'Dr. Martinez'],
  Dental: ['Dr. Santos', 'Dr. Lim'],
  Laboratory: ['Dr. A. Rivera', 'Dr. Jenni'],
  'Mental Health': ['Dr. S. Villaraza', 'Dr. Molina'],
  'Check-Up': ['Dr. B. Martinez', 'Dr. Humour']
};

const serviceByDepartment: Record<string, string[]> = {
  'General Medicine': ['General Check-Up', 'Follow-up Visit', 'Medical Clearance'],
  Pediatrics: ['Pediatric Consultation', 'Child Wellness Visit'],
  Orthopedic: ['Bone and Joint Consultation', 'Sports Injury Assessment'],
  Dental: ['Oral Consultation', 'Tooth Extraction Assessment'],
  Laboratory: ['Lab Result Review', 'Diagnostic Referral'],
  'Mental Health': ['Counseling', 'Psychiatric Consultation'],
  'Check-Up': ['Annual Physical Exam', 'Routine Check-Up']
};

const departmentOptions = Object.keys(departmentDoctorMap);
const priorityOptions: Array<'Routine' | 'Urgent'> = ['Routine', 'Urgent'];
const paymentOptions = ['Cash', 'Card', 'HMO', 'Online'];
const sexOptions = ['Male', 'Female', 'Other'];

const doctorDirectory = ref<string[]>(Array.from(new Set(Object.values(departmentDoctorMap).flat())));
const submitting = ref(false);
const step = ref<CreateStep>(1);
const stepError = ref('');
const submitSuccess = ref<null | { bookingId: string; patientName: string; date: string; time: string }>(null);
const errors = reactive<Record<string, string>>({});

const form = reactive<
  CreateAppointmentPayload & {
    guardian_name: string;
    consent_acknowledged: boolean;
  }
>({
  patient_id: '',
  patient_name: '',
  patient_email: '',
  phone_number: '',
  emergency_contact: '',
  insurance_provider: '',
  payment_method: 'Cash',
  appointment_priority: 'Routine',
  doctor_name: 'Dr. Humour',
  department_name: 'General Medicine',
  visit_type: 'General Check-Up',
  appointment_date: toInputDate(new Date()),
  preferred_time: '',
  symptoms_summary: '',
  doctor_notes: '',
  visit_reason: '',
  patient_age: null,
  patient_sex: '',
  status: 'New',
  guardian_name: '',
  consent_acknowledged: false
});

const modalTitle = computed(() => (submitSuccess.value ? 'Booking Submitted' : 'Book Appointment'));
const stepStatus = computed(() => ({ patient: step.value >= 1, schedule: step.value >= 2, review: step.value >= 3 }));
const isMinor = computed(() => Number(form.patient_age || 0) > 0 && Number(form.patient_age || 0) < 18);

const doctorOptionsForDepartment = computed(() => {
  const department = form.department_name || 'General Medicine';
  const staticDoctors = departmentDoctorMap[department] || [];
  const dynamicDoctors = doctorDirectory.value.filter((name) => staticDoctors.includes(name));
  const merged = Array.from(new Set([...staticDoctors, ...dynamicDoctors]));
  return merged.length ? merged : doctorDirectory.value;
});

const visitTypeOptions = computed(() => {
  const department = form.department_name || 'General Medicine';
  return serviceByDepartment[department] || ['General Check-Up'];
});

const reviewRows = computed(() => [
  { label: 'Patient', value: form.patient_name || '--' },
  { label: 'Phone', value: form.phone_number || '--' },
  { label: 'Department', value: form.department_name || '--' },
  { label: 'Doctor', value: form.doctor_name || '--' },
  { label: 'Visit Type', value: form.visit_type || '--' },
  { label: 'Schedule', value: `${form.appointment_date || '--'} ${form.preferred_time || ''}`.trim() },
  { label: 'Priority', value: form.appointment_priority || '--' }
]);

function toInputDate(value: Date): string {
  const localDate = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function clearErrors(): void {
  stepError.value = '';
  Object.keys(errors).forEach((key) => {
    errors[key] = '';
  });
}

function resetForm(): void {
  clearErrors();
  submitSuccess.value = null;
  step.value = 1;
  form.patient_id = '';
  form.patient_name = props.patientContext?.fullName || '';
  form.patient_email = props.patientContext?.email || '';
  form.phone_number = props.patientContext?.phoneNumber || '';
  form.emergency_contact = '';
  form.insurance_provider = '';
  form.payment_method = 'Cash';
  form.appointment_priority = 'Routine';
  form.department_name = 'General Medicine';
  form.doctor_name = departmentDoctorMap['General Medicine'][0] || 'Dr. Humour';
  form.visit_type = serviceByDepartment['General Medicine'][0] || 'General Check-Up';
  form.appointment_date = toInputDate(new Date());
  form.preferred_time = '';
  form.symptoms_summary = '';
  form.doctor_notes = '';
  form.visit_reason = '';
  form.patient_age = null;
  form.patient_sex = props.patientContext?.sex || '';
  form.status = 'New';
  form.guardian_name = '';
  form.consent_acknowledged = false;
  if (props.patientContext?.patientCode) {
    form.patient_id = props.patientContext.patientCode;
  }
}

function closeModal(): void {
  if (submitting.value) return;
  model.value = false;
}

function normalizeDepartmentSelection(): void {
  const doctors = departmentDoctorMap[form.department_name] || [];
  const visits = serviceByDepartment[form.department_name] || [];
  if (doctors.length && !doctors.includes(form.doctor_name || '')) {
    form.doctor_name = doctors[0];
  }
  if (visits.length && !visits.includes(form.visit_type || '')) {
    form.visit_type = visits[0];
  }
}

function validateStepOne(): boolean {
  clearErrors();
  const phone = String(form.phone_number || '').trim();
  const phoneValid = /^[0-9+\-\s()]{7,20}$/.test(phone);
  if (!String(form.patient_name || '').trim()) errors.patient_name = 'Patient name is required.';
  if (!phone) errors.phone_number = 'Phone number is required.';
  else if (!phoneValid) errors.phone_number = 'Enter a valid phone number.';
  if (!String(form.patient_sex || '').trim()) errors.patient_sex = 'Please select sex.';
  if (Number(form.patient_age || 0) <= 0) errors.patient_age = 'Please enter valid age.';
  if (isMinor.value && !String(form.guardian_name || '').trim()) errors.guardian_name = 'Guardian name is required for minors.';
  return !Object.values(errors).some(Boolean);
}

function validateStepTwo(): boolean {
  clearErrors();
  const today = toInputDate(new Date());
  if (!String(form.department_name || '').trim()) errors.department_name = 'Department is required.';
  if (!String(form.doctor_name || '').trim()) errors.doctor_name = 'Doctor is required.';
  if (!String(form.visit_type || '').trim()) errors.visit_type = 'Visit type is required.';
  if (!String(form.appointment_date || '').trim()) errors.appointment_date = 'Appointment date is required.';
  else if (String(form.appointment_date) < today) errors.appointment_date = 'Appointment date cannot be in the past.';
  if (form.appointment_priority === 'Urgent' && !String(form.emergency_contact || '').trim()) {
    errors.emergency_contact = 'Emergency contact is required for urgent booking.';
  }
  return !Object.values(errors).some(Boolean);
}

function validateStepThree(): boolean {
  clearErrors();
  if (!String(form.visit_reason || '').trim()) errors.visit_reason = 'Chief complaint is required.';
  if (!form.consent_acknowledged) errors.consent_acknowledged = 'Please acknowledge the consent and privacy notice.';
  return !Object.values(errors).some(Boolean);
}

function nextStep(): void {
  const valid = step.value === 1 ? validateStepOne() : step.value === 2 ? validateStepTwo() : validateStepThree();
  if (!valid) {
    stepError.value = 'Please complete required fields before continuing.';
    return;
  }
  stepError.value = '';
  step.value = Math.min(3, step.value + 1) as CreateStep;
}

function previousStep(): void {
  clearErrors();
  step.value = Math.max(1, step.value - 1) as CreateStep;
}

async function submitBooking(): Promise<void> {
  if (!validateStepThree()) {
    stepError.value = 'Please complete required fields before submitting.';
    return;
  }
  submitting.value = true;
  try {
    const created = await createAppointment({
      patient_id: String(form.patient_id || '').trim() || undefined,
      patient_name: String(form.patient_name || '').trim(),
      patient_email: String(form.patient_email || '').trim() || undefined,
      phone_number: String(form.phone_number || '').trim(),
      emergency_contact: String(form.emergency_contact || '').trim() || undefined,
      insurance_provider: String(form.insurance_provider || '').trim() || undefined,
      payment_method: String(form.payment_method || '').trim() || undefined,
      appointment_priority: form.appointment_priority || 'Routine',
      doctor_name: String(form.doctor_name || '').trim(),
      department_name: String(form.department_name || '').trim(),
      visit_type: String(form.visit_type || '').trim(),
      appointment_date: String(form.appointment_date || '').trim(),
      preferred_time: String(form.preferred_time || '').trim() || undefined,
      symptoms_summary: String(form.symptoms_summary || '').trim() || undefined,
      doctor_notes: String(form.doctor_notes || '').trim() || undefined,
      visit_reason: String(form.visit_reason || '').trim(),
      patient_age: Number(form.patient_age || 0) || null,
      patient_sex: String(form.patient_sex || '').trim() || undefined,
      guardian_name: String(form.guardian_name || '').trim() || undefined,
      status: 'New'
    });

    submitSuccess.value = {
      bookingId: created.bookingId,
      patientName: created.patientName,
      date: created.scheduleDate,
      time: created.scheduleTime || '--'
    };
  } catch (error) {
    stepError.value = error instanceof Error ? error.message : String(error);
  } finally {
    submitting.value = false;
  }
}

watch(
  () => model.value,
  (open) => {
    if (open) {
      resetForm();
    }
  }
);
</script>

<template>
  <v-dialog v-model="model" max-width="980" :persistent="submitting">
    <v-card class="booking-modal">
      <v-card-title class="modal-title d-flex align-center justify-space-between">
        <span>{{ modalTitle }}</span>
        <v-btn icon variant="text" :disabled="submitting" @click="closeModal">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text>
        <template v-if="!submitSuccess">
          <div class="modal-stepper" role="group" aria-label="Booking steps">
            <div class="step" :class="{ active: stepStatus.patient, current: step === 1 }"><span>1</span><label>Patient Info</label></div>
            <div class="line"></div>
            <div class="step" :class="{ active: stepStatus.schedule, current: step === 2 }"><span>2</span><label>Schedule</label></div>
            <div class="line"></div>
            <div class="step" :class="{ active: stepStatus.review, current: step === 3 }"><span>3</span><label>Review</label></div>
          </div>

          <div v-if="stepError" class="error-banner">{{ stepError }}</div>

          <div v-if="step === 1" class="form-grid">
            <div class="grid-col span-12">
              <v-text-field
                v-model="form.patient_id"
                label="Patient ID (optional)"
                variant="outlined"
                density="comfortable"
                hint="If you already have a patient ID, enter it here."
                persistent-hint
                hide-details="auto"
              />
            </div>
            <div class="grid-col span-6"><v-text-field v-model="form.patient_name" label="Patient Name *" variant="outlined" density="comfortable" :error-messages="errors.patient_name" /></div>
            <div class="grid-col span-6"><v-text-field v-model="form.patient_email" label="Email" variant="outlined" density="comfortable" hide-details /></div>
            <div class="grid-col span-6"><v-text-field v-model="form.phone_number" label="Phone Number *" variant="outlined" density="comfortable" :error-messages="errors.phone_number" /></div>
            <div class="grid-col span-3"><v-text-field v-model.number="form.patient_age" label="Age *" type="number" min="0" variant="outlined" density="comfortable" :error-messages="errors.patient_age" /></div>
            <div class="grid-col span-3"><v-select v-model="form.patient_sex" :items="sexOptions" label="Sex *" variant="outlined" density="comfortable" :error-messages="errors.patient_sex" /></div>
            <div class="grid-col span-12" v-if="isMinor">
              <v-text-field
                v-model="form.guardian_name"
                label="Guardian Name *"
                variant="outlined"
                density="comfortable"
                :error-messages="errors.guardian_name"
                hint="Required for patients below 18"
                persistent-hint
              />
            </div>
          </div>

          <div v-if="step === 2" class="form-grid">
            <div class="grid-col span-6">
              <v-select
                v-model="form.department_name"
                :items="departmentOptions"
                label="Department *"
                variant="outlined"
                density="comfortable"
                :error-messages="errors.department_name"
                @update:model-value="normalizeDepartmentSelection"
              />
            </div>
            <div class="grid-col span-6"><v-select v-model="form.doctor_name" :items="doctorOptionsForDepartment" label="Doctor *" variant="outlined" density="comfortable" :error-messages="errors.doctor_name" /></div>
            <div class="grid-col span-6"><v-select v-model="form.visit_type" :items="visitTypeOptions" label="Visit Type *" variant="outlined" density="comfortable" :error-messages="errors.visit_type" /></div>
            <div class="grid-col span-3">
              <SaasDateTimePickerField v-model="form.appointment_date" mode="date" label="Date *" :error-messages="errors.appointment_date" />
            </div>
            <div class="grid-col span-3">
              <SaasDateTimePickerField v-model="form.preferred_time" mode="time" label="Preferred Time" clearable />
            </div>
            <div class="grid-col span-4"><v-select v-model="form.appointment_priority" :items="priorityOptions" label="Priority" variant="outlined" density="comfortable" /></div>
            <div class="grid-col span-4"><v-text-field v-model="form.emergency_contact" label="Emergency Contact" variant="outlined" density="comfortable" :error-messages="errors.emergency_contact" /></div>
            <div class="grid-col span-4"><v-select v-model="form.payment_method" :items="paymentOptions" label="Payment Method" variant="outlined" density="comfortable" hide-details /></div>
            <div class="grid-col span-12"><v-text-field v-model="form.insurance_provider" label="Insurance / HMO Provider" variant="outlined" density="comfortable" hide-details /></div>
          </div>

          <div v-if="step === 3" class="form-grid">
            <div class="grid-col span-12 review-grid">
              <article v-for="item in reviewRows" :key="item.label"><label>{{ item.label }}</label><strong>{{ item.value || '--' }}</strong></article>
            </div>
            <div class="grid-col span-12"><v-textarea v-model="form.visit_reason" rows="2" label="Chief Complaint *" variant="outlined" density="comfortable" :error-messages="errors.visit_reason" /></div>
            <div class="grid-col span-12"><v-textarea v-model="form.symptoms_summary" rows="2" label="Symptoms Summary" variant="outlined" density="comfortable" hide-details /></div>
            <div class="grid-col span-12"><v-textarea v-model="form.doctor_notes" rows="2" label="Notes For Doctor" variant="outlined" density="comfortable" hide-details /></div>
            <div class="grid-col span-12">
              <v-checkbox
                v-model="form.consent_acknowledged"
                color="primary"
                label="I confirm details are correct and consent to processing for appointment care."
                :error-messages="errors.consent_acknowledged"
                hide-details="auto"
              />
            </div>
          </div>
        </template>

        <div v-else class="success-state">
          <v-icon icon="mdi-check-decagram" color="success" size="52" />
          <h3>Booking Confirmed</h3>
          <p>{{ submitSuccess.patientName }} has been queued with booking ID <strong>{{ submitSuccess.bookingId }}</strong>.</p>
          <p>Schedule: {{ submitSuccess.date }} {{ submitSuccess.time }}</p>
        </div>
      </v-card-text>

      <v-card-actions class="modal-actions">
        <template v-if="!submitSuccess">
          <v-btn variant="text" :disabled="submitting" @click="closeModal">Cancel</v-btn>
          <v-spacer />
          <v-btn v-if="step > 1" variant="outlined" :disabled="submitting" @click="previousStep">Back</v-btn>
          <v-btn v-if="step < 3" color="primary" :disabled="submitting" @click="nextStep">Next</v-btn>
          <v-btn v-else color="primary" :loading="submitting" :disabled="submitting" @click="submitBooking">Submit Booking</v-btn>
        </template>
        <template v-else>
          <v-spacer />
          <v-btn color="primary" @click="closeModal">Done</v-btn>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.booking-modal { border-radius: 14px; }
.modal-title { font-size: 21px; font-weight: 800; color: #16395d; }
.modal-stepper { display: flex; align-items: center; margin-bottom: 18px; }
.modal-stepper .step { min-width: 120px; display: flex; flex-direction: column; align-items: center; color: #5a7586; font-weight: 700; gap: 6px; }
.modal-stepper .step span { width: 32px; height: 32px; border-radius: 50%; border: 1px solid #c2d7e4; display: flex; align-items: center; justify-content: center; background: #fff; }
.modal-stepper .step.active span { background: #dff2ff; border-color: #79bef1; color: #0f66e8; }
.modal-stepper .step.current span { background: #0f66e8; border-color: #0f66e8; color: #fff; }
.modal-stepper .line { flex: 1; height: 1px; background: #d0e1ea; }
.form-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; }
.grid-col { grid-column: span 12; min-width: 0; }
.grid-col.span-6 { grid-column: span 6; }
.grid-col.span-4 { grid-column: span 4; }
.grid-col.span-3 { grid-column: span 3; }
.review-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.review-grid article { border: 1px solid #d2e3ed; border-radius: 10px; padding: 10px; }
.review-grid label { font-size: 12px; color: #628094; display: block; }
.review-grid strong { color: #183d59; font-size: 14px; }
.error-banner { background: #fff0f0; border: 1px solid #f4cccc; color: #b03232; padding: 8px 10px; border-radius: 8px; margin-bottom: 14px; font-weight: 600; }
.success-state { text-align: center; padding: 20px 10px; }
.success-state h3 { margin: 10px 0 8px; color: #1c4f36; }
.modal-actions { padding: 14px 20px 20px; }

@media (max-width: 991px) {
  .review-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .modal-stepper .line { display: none; }
  .modal-stepper { gap: 8px; justify-content: center; }
  .grid-col.span-6, .grid-col.span-4, .grid-col.span-3 { grid-column: span 12; }
}

@media (max-width: 680px) {
  .review-grid { grid-template-columns: 1fr; }
}
</style>
