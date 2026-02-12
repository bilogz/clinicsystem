<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  fetchAppointments,
  updateAppointment,
  type AppointmentAnalytics,
  type AppointmentRow,
  type AppointmentStatus
} from '@/services/appointmentsAdmin';

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const statusFilter = ref('All Statuses');
const serviceFilter = ref('All Services');
const doctorFilter = ref('Doctor: Any');
const periodFilter = ref('Period: Upcoming');
const searchValue = ref('');

const page = ref(1);
const perPage = 8;

const statusOptions = ['All Statuses', 'Confirmed', 'Pending', 'Accepted', 'Awaiting', 'Canceled'];
const periodOptions = ['Period: Upcoming', 'Today', 'This Week', 'This Month'];

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
const selected = ref<AppointmentRow | null>(null);
const editForm = reactive({
  doctorName: '',
  service: '',
  date: '',
  time: '',
  status: 'Pending' as AppointmentStatus,
  reason: ''
});

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

async function loadAppointments(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
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
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
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
  editForm.date = item.scheduleDate;
  editForm.time = item.scheduleTime;
  editForm.status = item.status;
  editForm.reason = item.visitReason || '';
  editDialog.value = true;
}

async function saveEdit(): Promise<void> {
  if (!selected.value) return;
  saving.value = true;
  successMessage.value = '';
  errorMessage.value = '';
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
    successMessage.value = 'Appointment updated successfully.';
    editDialog.value = false;
    await loadAppointments();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    saving.value = false;
  }
}

async function markReschedule(item: AppointmentRow): Promise<void> {
  saving.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await updateAppointment({
      booking_id: item.bookingId,
      status: 'Pending'
    });
    successMessage.value = 'Appointment moved to pending queue for reschedule.';
    await loadAppointments();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    saving.value = false;
  }
}

watch([statusFilter, serviceFilter, doctorFilter, periodFilter], () => {
  page.value = 1;
  void loadAppointments();
});

watch(page, () => {
  void loadAppointments();
});

onMounted(() => {
  void loadAppointments();
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
            <v-btn color="primary" prepend-icon="mdi-plus" rounded="lg" class="mt-2">Add Appointment</v-btn>
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

    <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-3">{{ errorMessage }}</v-alert>
    <v-alert v-if="successMessage" type="success" variant="tonal" class="mb-3">{{ successMessage }}</v-alert>

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
            <v-btn variant="outlined" color="secondary" prepend-icon="mdi-filter-off-outline" @click="clearFilters">Clear Filters</v-btn>
            <v-btn color="primary" prepend-icon="mdi-refresh" :loading="loading" @click="loadAppointments">Reload</v-btn>
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
                    <v-icon icon="mdi-eye-outline" />
                  </v-btn>
                  <v-btn icon size="small" class="saas-icon-btn" color="indigo" variant="tonal" @click="openEdit(item)">
                    <v-icon icon="mdi-pencil-outline" />
                  </v-btn>
                  <v-btn size="small" color="error" variant="flat" append-icon="mdi-chevron-down" @click="markReschedule(item)">Reschedule</v-btn>
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
      <v-card>
        <v-card-title class="text-h6">Appointment Details</v-card-title>
        <v-card-text v-if="selected">
          <div><strong>Booking ID:</strong> {{ selected.bookingId }}</div>
          <div><strong>Patient:</strong> {{ selected.patientName }}</div>
          <div><strong>Email:</strong> {{ selected.patientEmail || '--' }}</div>
          <div><strong>Phone:</strong> {{ selected.phoneNumber || '--' }}</div>
          <div><strong>Service:</strong> {{ selected.service }}</div>
          <div><strong>Doctor:</strong> {{ selected.doctor }}</div>
          <div><strong>Date:</strong> {{ formatDate(selected.scheduleDate) }}</div>
          <div><strong>Time:</strong> {{ selected.scheduleTime || '--' }}</div>
          <div><strong>Status:</strong> {{ selected.status }}</div>
          <div><strong>Reason:</strong> {{ selected.visitReason || '--' }}</div>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="viewDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="editDialog" max-width="700">
      <v-card>
        <v-card-title class="text-h6">Edit Appointment</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="6"><v-text-field v-model="editForm.doctorName" label="Doctor" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="editForm.service" label="Service" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="editForm.date" label="Date (YYYY-MM-DD)" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="editForm.time" label="Preferred Time" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="12" md="6"><v-select v-model="editForm.status" :items="['Confirmed', 'Pending', 'Accepted', 'Awaiting', 'Canceled']" label="Status" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="12"><v-textarea v-model="editForm.reason" label="Visit Reason" rows="3" variant="outlined" density="comfortable" /></v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="editDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveEdit">Save</v-btn>
        </v-card-actions>
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

.saas-icon-btn {
  border-radius: 10px;
  border: 1px solid rgba(69, 98, 175, 0.22) !important;
  box-shadow: 0 4px 12px rgba(23, 50, 103, 0.14);
}
</style>
