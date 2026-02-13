<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { EyeIcon, EditIcon } from 'vue-tabler-icons';
import SaasDateTimePickerField from '@/components/shared/SaasDateTimePickerField.vue';
import { useRealtimeListSync } from '@/composables/useRealtimeListSync';
import { REALTIME_POLICY } from '@/config/realtimePolicy';
import {
  createAppointment,
  fetchAppointments,
  updateAppointment,
  type CreateAppointmentPayload,
  type AppointmentAnalytics,
  type AppointmentRow,
  type AppointmentStatus
} from '@/services/appointmentsAdmin';

const loading = ref(false);
const saving = ref(false);
const addSaving = ref(false);
const realtime = useRealtimeListSync();

const statusFilter = ref('All Statuses');
const serviceFilter = ref('All Services');
const doctorFilter = ref('Doctor: Any');
const periodFilter = ref('Period: Upcoming');
const searchValue = ref('');

const page = ref(1);
const perPage = 8;

const statusOptions = ['All Statuses', 'New', 'Confirmed', 'Pending', 'Accepted', 'Awaiting', 'Canceled'];
const periodOptions = ['Period: Upcoming', 'Today', 'This Week', 'This Month'];
const appointmentStatusOptions: AppointmentStatus[] = ['New', 'Pending', 'Confirmed', 'Accepted', 'Awaiting', 'Canceled'];
const departmentOptions = ['General Medicine', 'Pediatrics', 'Orthopedic', 'Dental', 'Laboratory', 'Mental Health', 'Check-Up'];
const paymentOptions = ['Cash', 'Card', 'HMO', 'Online'];
const priorityOptions: Array<'Routine' | 'Urgent'> = ['Routine', 'Urgent'];
const symptomTags = ['Fever', 'Cough', 'Headache', 'Chest Pain', 'Abdominal Pain', 'Dizziness', 'Back Pain', 'Nausea'];
const departmentDoctorMap: Record<string, string[]> = {
  'General Medicine': ['Dr. Humour', 'Dr. Jenni'],
  Pediatrics: ['Dr. Rivera', 'Dr. Humour'],
  Orthopedic: ['Dr. Morco', 'Dr. Martinez'],
  Dental: ['Dr. Santos', 'Dr. Lim'],
  Laboratory: ['Dr. A. Rivera', 'Dr. Jenni'],
  'Mental Health': ['Dr. S. Villaraza', 'Dr. Jenni'],
  'Check-Up': ['Dr. B. Martinez', 'Dr. Humour']
};

const rows = ref<AppointmentRow[]>([]);
const analytics = ref<AppointmentAnalytics>({
  totalPatients: 0,
  totalAppointments: 0,
  todayAppointments: 0,
  pendingQueue: 0
});
const totalItems = ref(0);
const totalPages = ref(1);

const viewDialog = ref(false);
const editDialog = ref(false);
const addDialog = ref(false);
const feedbackDialog = ref(false);
const feedbackTitle = ref('Success');
const feedbackMessage = ref('');
const feedbackVariant = ref<'success' | 'error'>('success');
const selected = ref<AppointmentRow | null>(null);
const editForm = reactive({
  doctorName: '',
  service: '',
  date: '',
  time: '',
  status: 'Pending' as AppointmentStatus,
  reason: ''
});

const addForm = reactive<CreateAppointmentPayload>({
  patient_id: '',
  patient_name: '',
  patient_email: '',
  phone_number: '',
  emergency_contact: '',
  insurance_provider: '',
  payment_method: 'Cash',
  appointment_priority: 'Routine',
  doctor_name: '',
  department_name: '',
  visit_type: '',
  appointment_date: '',
  preferred_time: '',
  symptoms_summary: '',
  doctor_notes: '',
  visit_reason: '',
  patient_age: null,
  patient_gender: '',
  status: 'New'
});
const addFormErrors = reactive<Record<string, string>>({});
const useExistingPatient = ref(false);
const patientLookupKey = ref('');
const selectedSymptomTags = ref<string[]>([]);

const serviceOptions = computed(() => {
  const dynamic = Array.from(new Set(rows.value.map((row) => row.service).filter(Boolean))).sort();
  return ['All Services', ...dynamic];
});

const doctorOptions = computed(() => {
  const dynamic = Array.from(new Set(rows.value.map((row) => row.doctor).filter(Boolean))).sort();
  return ['Doctor: Any', ...dynamic];
});

const activeQuickFilters = computed(() => {
  const chips: string[] = [];
  if (statusFilter.value !== 'All Statuses') chips.push(statusFilter.value);
  if (serviceFilter.value !== 'All Services') chips.push(serviceFilter.value);
  if (doctorFilter.value !== 'Doctor: Any') chips.push(doctorFilter.value);
  if (periodFilter.value !== 'Period: Upcoming') chips.push(periodFilter.value);
  return chips;
});

const cardData = computed(() => [
  { title: 'TOTAL PATIENTS', value: analytics.value.totalPatients, subtitle: 'Registered records', className: 'analytics-card-green', icon: 'mdi-account-group-outline' },
  { title: 'TOTAL APPOINTMENTS', value: analytics.value.totalAppointments, subtitle: 'All booking entries', className: 'analytics-card-blue', icon: 'mdi-calendar-check-outline' },
  { title: "TODAY'S APPOINTMENTS", value: analytics.value.todayAppointments, subtitle: 'Scheduled for today', className: 'analytics-card-orange', icon: 'mdi-calendar-today' },
  { title: 'PENDING QUEUE', value: analytics.value.pendingQueue, subtitle: 'Awaiting action', className: 'analytics-card-purple', icon: 'mdi-timer-sand' }
]);

function toApiPeriod(value: string): string {
  const lowered = value.toLowerCase();
  if (lowered.includes('today')) return 'Today';
  if (lowered.includes('this week')) return 'This Week';
  if (lowered.includes('this month')) return 'This Month';
  return 'Upcoming';
}

function formatDate(dateValue: string): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue || '--';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).format(date);
}

function toInputDate(dateValue: string): string {
  if (!dateValue) return '';
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    const raw = String(dateValue).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }
  const utc = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return utc.toISOString().slice(0, 10);
}

function statusColor(status: AppointmentStatus): string {
  const lowered = status.toLowerCase();
  if (lowered === 'confirmed' || lowered === 'accepted') return 'success';
  if (lowered === 'pending' || lowered === 'awaiting') return 'warning';
  return 'error';
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function normalizeDoctor(value: string): string {
  return value.replace(/^Doctor:\s*/i, '').trim();
}

const existingPatientOptions = computed(() => {
  const seen = new Set<string>();
  return rows.value
    .map((row) => {
      const pid = row.patientId || '';
      const key = pid || `${row.patientName}|${row.phoneNumber}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        title: pid ? `${row.patientName} (${pid})` : `${row.patientName} (${row.phoneNumber})`,
        value: key,
        row
      };
    })
    .filter((item): item is { title: string; value: string; row: AppointmentRow } => Boolean(item));
});

const doctorOptionsForDepartment = computed(() => {
  const department = addForm.department_name || '';
  const staticList = departmentDoctorMap[department] || [];
  const dynamicList = rows.value
    .filter((item) => item.department === addForm.department_name && item.doctor)
    .map((item) => item.doctor);
  return Array.from(new Set([...staticList, ...dynamicList]));
});

async function loadAppointments(options: { silent?: boolean } = {}): Promise<void> {
  if (!options.silent) {
    loading.value = true;
  }
  try {
    const payload = await fetchAppointments({
      search: searchValue.value.trim(),
      status: statusFilter.value,
      service: serviceFilter.value,
      doctor: doctorFilter.value,
      period: toApiPeriod(periodFilter.value),
      page: page.value,
      perPage
    });
    rows.value = payload.items;
    analytics.value = payload.analytics;
    totalItems.value = payload.meta.total;
    totalPages.value = payload.meta.totalPages;
  } catch (error) {
    if (!options.silent) {
      showFeedback('error', 'Loading failed', error instanceof Error ? error.message : String(error));
    }
  } finally {
    if (!options.silent) {
      loading.value = false;
    }
  }
}

function showFeedback(variant: 'success' | 'error', title: string, message: string): void {
  feedbackVariant.value = variant;
  feedbackTitle.value = title;
  feedbackMessage.value = message;
  feedbackDialog.value = true;
}

function clearFilters(): void {
  statusFilter.value = 'All Statuses';
  serviceFilter.value = 'All Services';
  doctorFilter.value = 'Doctor: Any';
  periodFilter.value = 'Period: Upcoming';
  searchValue.value = '';
  page.value = 1;
  void loadAppointments();
}

function openView(item: AppointmentRow): void {
  selected.value = item;
  viewDialog.value = true;
}

function openEdit(item: AppointmentRow): void {
  selected.value = item;
  editForm.doctorName = item.doctor;
  editForm.service = item.service;
  editForm.date = toInputDate(item.scheduleDate);
  editForm.time = item.scheduleTime;
  editForm.status = item.status;
  editForm.reason = item.visitReason || '';
  editDialog.value = true;
}

function openAddDialog(): void {
  Object.keys(addFormErrors).forEach((key) => {
    addFormErrors[key] = '';
  });
  useExistingPatient.value = false;
  patientLookupKey.value = '';
  selectedSymptomTags.value = [];
  addForm.patient_id = '';
  addForm.patient_name = '';
  addForm.patient_email = '';
  addForm.phone_number = '';
  addForm.emergency_contact = '';
  addForm.insurance_provider = '';
  addForm.payment_method = 'Cash';
  addForm.appointment_priority = 'Routine';
  addForm.department_name = 'General Medicine';
  addForm.doctor_name = departmentDoctorMap['General Medicine'][0] || doctorOptions.value.find((item) => item !== 'Doctor: Any') || '';
  addForm.visit_type = 'General Check-Up';
  addForm.appointment_date = toInputDate(new Date().toISOString());
  addForm.preferred_time = '';
  addForm.symptoms_summary = '';
  addForm.doctor_notes = '';
  addForm.visit_reason = '';
  addForm.patient_age = null;
  addForm.patient_gender = '';
  addForm.status = 'New';
  addDialog.value = true;
}

async function saveEdit(): Promise<void> {
  if (!selected.value) return;
  saving.value = true;
  try {
    await updateAppointment({
      booking_id: selected.value.bookingId,
      doctor_name: editForm.doctorName,
      visit_type: editForm.service,
      appointment_date: editForm.date,
      preferred_time: editForm.time,
      status: editForm.status,
      visit_reason: editForm.reason
    });
    showFeedback('success', 'Appointment updated', 'Appointment updated successfully.');
    editDialog.value = false;
    await loadAppointments();
  } catch (error) {
    showFeedback('error', 'Update failed', error instanceof Error ? error.message : String(error));
  } finally {
    saving.value = false;
  }
}

async function markReschedule(item: AppointmentRow): Promise<void> {
  saving.value = true;
  try {
    await updateAppointment({
      booking_id: item.bookingId,
      status: 'Pending'
    });
    showFeedback('success', 'Reschedule queued', 'Appointment moved to pending queue for reschedule.');
    await loadAppointments();
  } catch (error) {
    showFeedback('error', 'Reschedule failed', error instanceof Error ? error.message : String(error));
  } finally {
    saving.value = false;
  }
}

async function saveAdd(): Promise<void> {
  Object.keys(addFormErrors).forEach((key) => {
    addFormErrors[key] = '';
  });

  const phone = String(addForm.phone_number || '').trim();
  const isPhoneValid = /^[0-9+\-\s()]{7,20}$/.test(phone);
  if (!String(addForm.patient_name || '').trim()) addFormErrors.patient_name = 'Patient name is required.';
  if (!phone) addFormErrors.phone_number = 'Phone number is required.';
  else if (!isPhoneValid) addFormErrors.phone_number = 'Enter a valid phone number.';
  if (!String(addForm.department_name || '').trim()) addFormErrors.department_name = 'Department is required.';
  if (!String(addForm.doctor_name || '').trim()) addFormErrors.doctor_name = 'Doctor is required.';
  if (!String(addForm.visit_type || '').trim()) addFormErrors.visit_type = 'Visit type is required.';
  if (!String(addForm.appointment_date || '').trim()) addFormErrors.appointment_date = 'Appointment date is required.';
  if (!String(addForm.status || '').trim()) addFormErrors.status = 'Status is required.';
  if (useExistingPatient.value && !String(addForm.patient_id || '').trim()) addFormErrors.patient_id = 'Patient ID is required for existing patient lookup.';
  if (addForm.appointment_priority === 'Urgent' && !String(addForm.emergency_contact || '').trim()) {
    addFormErrors.emergency_contact = 'Emergency contact is required for urgent appointments.';
  }

  if (Object.values(addFormErrors).some(Boolean)) {
    showFeedback('error', 'Validation failed', 'Please fix highlighted fields before saving.');
    return;
  }

  addForm.symptoms_summary = [selectedSymptomTags.value.join(', '), String(addForm.visit_reason || '').trim()].filter(Boolean).join(' | ');
  addSaving.value = true;
  try {
    await createAppointment(addForm);
    addDialog.value = false;
    showFeedback('success', 'Appointment created', 'New appointment has been added successfully.');
    await loadAppointments();
  } catch (error) {
    showFeedback('error', 'Create failed', error instanceof Error ? error.message : String(error));
  } finally {
    addSaving.value = false;
  }
}

function applyExistingPatientLookup(value: string): void {
  patientLookupKey.value = value;
  const target = existingPatientOptions.value.find((item) => item.value === value);
  if (!target) return;
  const row = target.row;
  addForm.patient_id = row.patientId || '';
  addForm.patient_name = row.patientName;
  addForm.patient_email = row.patientEmail || '';
  addForm.phone_number = row.phoneNumber || '';
}

function onDepartmentChange(value: string): void {
  const doctors = departmentDoctorMap[value] || [];
  if (!doctors.length) return;
  if (!doctors.includes(addForm.doctor_name || '')) {
    addForm.doctor_name = doctors[0];
  }
}

watch(
  () => addForm.department_name,
  (value) => {
    if (!value) return;
    onDepartmentChange(value);
  }
);

watch([statusFilter, serviceFilter, doctorFilter, periodFilter], () => {
  page.value = 1;
  void loadAppointments();
});

watch(page, () => {
  void loadAppointments();
});

onMounted(() => {
  void loadAppointments();
  realtime.startPolling(() => {
    void loadAppointments({ silent: true });
  }, REALTIME_POLICY.polling.registrationMs);
});

onBeforeUnmount(() => {
  realtime.stopPolling();
  realtime.invalidatePending();
});
</script>

<template>
  <section class="appointments-page">
    <v-card class="hero-banner mb-4" elevation="0">
      <v-card-text class="pa-5">
        <div class="d-flex flex-wrap align-center justify-space-between ga-4">
          <div>
            <div class="hero-kicker">Clinical Operations</div>
            <h1 class="text-h4 font-weight-black mb-1">Appointments</h1>
            <p class="hero-subtitle mb-0">Manage and review all patient bookings.</p>
          </div>
          <div class="hero-side-card">
            <div class="hero-side-label">Booking Actions</div>
            <div class="hero-side-text">Create and manage schedule entries from one queue.</div>
            <v-btn color="primary" prepend-icon="mdi-plus" rounded="pill" class="mt-2 saas-primary-btn" @click="openAddDialog">Add Appointment</v-btn>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <v-row class="mb-4">
      <v-col v-for="card in cardData" :key="card.title" cols="12" sm="6" lg="3">
        <v-card :class="['analytics-card', card.className]" elevation="0">
          <v-card-text class="pa-5">
            <div class="d-flex justify-space-between align-start">
              <div class="analytics-card-title">{{ card.title }}</div>
              <v-btn icon size="small" variant="outlined" class="analytics-card-icon">
                <v-icon :icon="card.icon" size="18" />
              </v-btn>
            </div>
            <div class="analytics-card-value">{{ card.value }}</div>
            <div class="analytics-card-subtitle">{{ card.subtitle }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card rounded="xl" variant="flat">
      <v-card-text class="pa-4 pa-md-5">
        <div class="d-flex flex-wrap ga-3 mb-3">
          <v-select v-model="statusFilter" :items="statusOptions" density="comfortable" variant="outlined" hide-details class="filter-field" />
          <v-select v-model="serviceFilter" :items="serviceOptions" density="comfortable" variant="outlined" hide-details class="filter-field" />
          <v-select v-model="doctorFilter" :items="doctorOptions" density="comfortable" variant="outlined" hide-details class="filter-field" />
          <v-select v-model="periodFilter" :items="periodOptions" density="comfortable" variant="outlined" hide-details class="filter-field" />
          <v-text-field
            v-model="searchValue"
            density="comfortable"
            variant="outlined"
            hide-details
            prepend-inner-icon="mdi-magnify"
            placeholder="Search patient name, email, phone..."
            class="search-field"
            @keyup.enter="loadAppointments"
          />
        </div>

        <div class="d-flex flex-wrap justify-space-between align-center ga-3 mb-6">
          <div class="d-flex flex-wrap ga-2">
            <v-chip
              v-for="chip in activeQuickFilters"
              :key="chip"
              color="primary"
              variant="tonal"
              rounded="lg"
              class="font-weight-medium"
            >
              {{ chip }}
            </v-chip>
          </div>

          <div class="d-flex flex-wrap ga-2">
            <v-btn variant="outlined" color="secondary" rounded="pill" class="saas-outline-btn" prepend-icon="mdi-filter-off-outline" @click="clearFilters">Clear Filters</v-btn>
            <v-btn color="primary" rounded="pill" class="saas-primary-btn" prepend-icon="mdi-refresh" :loading="loading" @click="loadAppointments">Reload</v-btn>
          </div>
        </div>

        <div class="d-flex justify-space-between align-center mb-2">
          <h2 class="text-h5 font-weight-bold">Appointments</h2>
          <p class="text-body-2 text-medium-emphasis">Showing {{ rows.length }} of {{ totalItems }}</p>
        </div>

        <v-table class="appointment-table" density="comfortable">
          <thead>
            <tr>
              <th>PATIENT</th>
              <th>SERVICE</th>
              <th>DOCTOR</th>
              <th>SCHEDULE</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in rows" :key="item.id">
              <td>
                <div class="d-flex align-center ga-3">
                  <v-avatar color="blue-grey-lighten-4" size="38">
                    <span class="text-caption font-weight-bold">{{ initials(item.patientName) }}</span>
                  </v-avatar>
                  <div>
                    <div class="font-weight-bold text-body-2">{{ item.patientName }}</div>
                    <div class="text-caption text-medium-emphasis">{{ item.patientEmail || item.phoneNumber }}</div>
                  </div>
                </div>
              </td>
              <td class="text-body-2">{{ item.service }}</td>
              <td class="text-body-2">{{ item.doctor }}</td>
              <td>
                <div class="text-body-2 font-weight-medium">{{ formatDate(item.scheduleDate) }}</div>
                <div class="text-caption text-medium-emphasis">{{ item.scheduleTime || '--' }}</div>
              </td>
              <td>
                <v-chip :color="statusColor(item.status)" variant="tonal" rounded="pill" size="small">
                  {{ item.status }}
                </v-chip>
              </td>
              <td>
                <div class="d-flex flex-wrap ga-2 align-center">
                  <v-btn icon size="small" class="saas-icon-btn" color="primary" variant="tonal" @click="openView(item)">
                    <EyeIcon class="action-icon action-icon-view" size="16" stroke-width="2.2" />
                  </v-btn>
                  <v-btn icon size="small" class="saas-icon-btn" color="indigo" variant="tonal" @click="openEdit(item)">
                    <EditIcon class="action-icon action-icon-edit" size="16" stroke-width="2.2" />
                  </v-btn>
                  <v-btn size="small" color="error" variant="flat" rounded="pill" class="saas-danger-btn" append-icon="mdi-chevron-down" @click="markReschedule(item)">Reschedule</v-btn>
                </div>
              </td>
            </tr>
            <tr v-if="rows.length === 0">
              <td colspan="6" class="text-center py-6 text-medium-emphasis">No appointments found for current filters.</td>
            </tr>
          </tbody>
        </v-table>

        <div class="d-flex flex-wrap justify-space-between align-center ga-3 mt-4">
          <p class="text-body-2 text-medium-emphasis">Showing {{ rows.length }} of {{ totalItems }}</p>
          <v-pagination v-model="page" :length="totalPages" :total-visible="7" rounded="circle" />
        </div>
      </v-card-text>
    </v-card>

    <v-dialog v-model="viewDialog" max-width="600">
      <v-card class="saas-modal-card">
        <v-card-title class="saas-modal-title text-h6 font-weight-bold">Appointment Details</v-card-title>
        <v-card-text v-if="selected">
          <div><strong>Booking ID:</strong> {{ selected.bookingId }}</div>
          <div><strong>Patient ID:</strong> {{ selected.patientId || '--' }}</div>
          <div><strong>Patient:</strong> {{ selected.patientName }}</div>
          <div><strong>Email:</strong> {{ selected.patientEmail || '--' }}</div>
          <div><strong>Phone:</strong> {{ selected.phoneNumber || '--' }}</div>
          <div><strong>Emergency Contact:</strong> {{ selected.emergencyContact || '--' }}</div>
          <div><strong>Service:</strong> {{ selected.service }}</div>
          <div><strong>Doctor:</strong> {{ selected.doctor }}</div>
          <div><strong>Priority:</strong> {{ selected.appointmentPriority || 'Routine' }}</div>
          <div><strong>Date:</strong> {{ formatDate(selected.scheduleDate) }}</div>
          <div><strong>Time:</strong> {{ selected.scheduleTime || '--' }}</div>
          <div><strong>Status:</strong> {{ selected.status }}</div>
          <div><strong>Symptoms:</strong> {{ selected.symptomsSummary || '--' }}</div>
          <div><strong>Doctor Notes:</strong> {{ selected.doctorNotes || '--' }}</div>
          <div><strong>Reason:</strong> {{ selected.visitReason || '--' }}</div>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="viewDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="editDialog" max-width="700">
      <v-card class="saas-modal-card">
        <v-card-title class="saas-modal-title text-h6 font-weight-bold">Edit Appointment</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="6"><v-text-field v-model="editForm.doctorName" label="Doctor" variant="outlined" density="comfortable" hide-details /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="editForm.service" label="Service" variant="outlined" density="comfortable" hide-details /></v-col>
            <v-col cols="12" md="6"><SaasDateTimePickerField v-model="editForm.date" mode="date" label="Date" /></v-col>
            <v-col cols="12" md="6"><SaasDateTimePickerField v-model="editForm.time" mode="time" label="Preferred Time" clearable /></v-col>
            <v-col cols="12" md="6"><v-select v-model="editForm.status" :items="appointmentStatusOptions" label="Status" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="12"><v-textarea v-model="editForm.reason" label="Visit Reason" rows="3" variant="outlined" density="comfortable" /></v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="editDialog = false">Cancel</v-btn>
          <v-btn color="primary" rounded="pill" class="saas-primary-btn" :loading="saving" @click="saveEdit">Save Changes</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="addDialog" max-width="840">
      <v-card class="saas-modal-card">
        <v-card-title class="saas-modal-title text-h6 font-weight-bold">Add Appointment</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12"><div class="modal-section-title">Patient Info</div></v-col>
            <v-col cols="12" md="5">
              <v-switch v-model="useExistingPatient" inset color="primary" label="Existing Patient Lookup" hide-details />
            </v-col>
            <v-col cols="12" md="7" v-if="useExistingPatient">
              <v-select
                :items="existingPatientOptions"
                item-title="title"
                item-value="value"
                :model-value="patientLookupKey"
                label="Search Existing Patient"
                variant="outlined"
                density="comfortable"
                hint="Select patient from previous appointment records"
                persistent-hint
                @update:model-value="applyExistingPatientLookup"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                v-model="addForm.patient_id"
                label="Patient ID (MRN)"
                variant="outlined"
                density="comfortable"
                :error-messages="addFormErrors.patient_id"
                hint="Required if using existing patient flow"
                persistent-hint
              />
            </v-col>
            <v-col cols="12" md="8">
              <v-text-field v-model="addForm.patient_name" label="Patient Name *" variant="outlined" density="comfortable" :error-messages="addFormErrors.patient_name" />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field v-model="addForm.phone_number" label="Phone Number *" variant="outlined" density="comfortable" :error-messages="addFormErrors.phone_number" />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field v-model="addForm.emergency_contact" label="Emergency / Contact Person" variant="outlined" density="comfortable" :error-messages="addFormErrors.emergency_contact" />
            </v-col>
            <v-col cols="12" md="6"><v-text-field v-model="addForm.patient_email" label="Patient Email" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="12" md="3"><v-text-field v-model.number="addForm.patient_age" type="number" min="0" label="Patient Age" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="12" md="3"><v-select v-model="addForm.patient_gender" :items="['Male', 'Female', 'Other']" label="Patient Gender" variant="outlined" density="comfortable" /></v-col>

            <v-col cols="12"><div class="modal-section-title">Appointment Details</div></v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="addForm.department_name"
                :items="departmentOptions"
                label="Department *"
                variant="outlined"
                density="comfortable"
                :error-messages="addFormErrors.department_name"
                hint="Doctor list depends on selected department"
                persistent-hint
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="addForm.doctor_name"
                :items="doctorOptionsForDepartment"
                label="Doctor *"
                variant="outlined"
                density="comfortable"
                :error-messages="addFormErrors.doctor_name"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field v-model="addForm.visit_type" label="Visit Type *" variant="outlined" density="comfortable" :error-messages="addFormErrors.visit_type" hint="Example: Follow-up, General Check-Up" persistent-hint />
            </v-col>
            <v-col cols="12" md="6">
              <v-select v-model="addForm.appointment_priority" :items="priorityOptions" label="Appointment Priority" variant="outlined" density="comfortable" />
            </v-col>
            <v-col cols="12" md="4">
              <SaasDateTimePickerField v-model="addForm.appointment_date" mode="date" label="Appointment Date *" :error-messages="addFormErrors.appointment_date" />
            </v-col>
            <v-col cols="12" md="4">
              <SaasDateTimePickerField v-model="addForm.preferred_time" mode="time" label="Preferred Time" clearable />
            </v-col>
            <v-col cols="12" md="4">
              <v-select v-model="addForm.status" :items="appointmentStatusOptions" label="Appointment Status *" variant="outlined" density="comfortable" :error-messages="addFormErrors.status" />
            </v-col>

            <v-col cols="12"><div class="modal-section-title">Medical Info</div></v-col>
            <v-col cols="12" md="6"><v-select v-model="addForm.payment_method" :items="paymentOptions" label="Payment Method" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="addForm.insurance_provider" label="Insurance Provider / Plan" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="12">
              <v-combobox
                v-model="selectedSymptomTags"
                :items="symptomTags"
                chips
                multiple
                clearable
                label="Symptoms / Chief Complaint (Structured)"
                variant="outlined"
                density="comfortable"
                hint="Pick common symptoms and add custom tags if needed"
                persistent-hint
              />
            </v-col>
            <v-col cols="12"><v-textarea v-model="addForm.visit_reason" label="Chief Complaint Details" rows="2" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="12"><v-textarea v-model="addForm.doctor_notes" label="Notes for Doctor" rows="2" variant="outlined" density="comfortable" /></v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="addDialog = false">Cancel</v-btn>
          <v-btn color="primary" rounded="pill" class="saas-primary-btn" :loading="addSaving" @click="saveAdd">Create Appointment</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="feedbackDialog" max-width="430">
      <v-card class="saas-modal-card feedback-card">
        <v-card-text class="pa-6">
          <div class="d-flex flex-column align-center text-center ga-3">
            <v-avatar :color="feedbackVariant === 'success' ? 'success' : 'error'" size="56" variant="tonal">
              <v-icon :icon="feedbackVariant === 'success' ? 'mdi-check-bold' : 'mdi-alert-circle-outline'" size="30" />
            </v-avatar>
            <h3 class="text-h6 font-weight-bold mb-0">{{ feedbackTitle }}</h3>
            <p class="text-body-2 text-medium-emphasis mb-0">{{ feedbackMessage }}</p>
            <v-btn color="primary" rounded="pill" class="saas-primary-btn mt-1" @click="feedbackDialog = false">Okay</v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.hero-banner {
  border-radius: 16px;
  color: #fff;
  background: linear-gradient(120deg, #162d84 0%, #2f63cc 54%, #3ea8f0 100%);
  box-shadow: 0 14px 30px rgba(19, 45, 126, 0.22);
}
.hero-kicker {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  margin-bottom: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.32);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.55px;
  text-transform: uppercase;
}
.hero-subtitle { color: rgba(255, 255, 255, 0.95); }
.hero-side-card {
  min-width: 250px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  color: #14316e;
}
.hero-side-label { font-size: 11px; font-weight: 700; text-transform: uppercase; }
.hero-side-text { margin-top: 4px; font-size: 13px; }

.analytics-card { color: #fff; border-radius: 12px; box-shadow: 0 10px 24px rgba(12, 31, 60, 0.18); }
.analytics-card-green { background: linear-gradient(135deg, #23ba63 0%, #129a51 100%); }
.analytics-card-blue { background: linear-gradient(135deg, #40a9f2 0%, #357adf 100%); }
.analytics-card-orange { background: linear-gradient(135deg, #ff9800 0%, #ff6f00 100%); }
.analytics-card-purple { background: linear-gradient(135deg, #a82cf0 0%, #7a1fca 100%); }
.analytics-card-title { font-size: 12px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; }
.analytics-card-value { font-size: 44px; font-weight: 800; line-height: 1.05; margin-top: 8px; }
.analytics-card-subtitle { margin-top: 4px; font-size: 14px; opacity: 0.95; }
.analytics-card-icon {
  color: #fff !important;
  border-color: rgba(255, 255, 255, 0.55) !important;
  background-color: rgba(255, 255, 255, 0.12) !important;
}

.filter-field { min-width: 170px; flex: 1 1 190px; }
.search-field { min-width: 280px; flex: 2 1 320px; }
.appointment-table th { font-size: 0.78rem; font-weight: 700; }
.appointment-table td { vertical-align: middle; }

.saas-primary-btn {
  box-shadow: 0 8px 18px rgba(24, 104, 208, 0.3);
  font-weight: 700;
  letter-spacing: 0.2px;
  text-transform: none;
}
.saas-outline-btn {
  border-width: 1px !important;
  text-transform: none;
  font-weight: 600;
}
.saas-danger-btn {
  box-shadow: 0 8px 16px rgba(248, 79, 66, 0.22);
  text-transform: none;
  font-weight: 700;
}
.saas-icon-btn {
  border-radius: 10px;
  border: 1px solid rgba(69, 98, 175, 0.22) !important;
  box-shadow: 0 4px 12px rgba(23, 50, 103, 0.14);
}
.action-icon {
  display: block;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.action-icon-view {
  color: #2365e2;
}
.action-icon-edit {
  color: #4f46e5;
}

.feedback-card {
  border: 1px solid rgba(76, 104, 168, 0.12);
  box-shadow: 0 20px 50px rgba(13, 36, 89, 0.22);
}

.saas-modal-card {
  border-radius: 16px !important;
  border: 1px solid rgba(76, 104, 168, 0.16);
  overflow: hidden;
}

.saas-modal-title {
  padding: 16px 24px !important;
  color: #1b2e67 !important;
  background: linear-gradient(180deg, rgba(35, 101, 226, 0.08) 0%, rgba(35, 101, 226, 0) 100%);
  border-bottom: 1px solid rgba(76, 104, 168, 0.14);
}

.modal-section-title {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #26417f;
}
</style>
