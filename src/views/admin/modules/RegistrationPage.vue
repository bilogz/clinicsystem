<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { EyeIcon, EditIcon, CheckIcon } from 'vue-tabler-icons';
import {
  approveRegistration,
  createRegistration,
  fetchRegistrations,
  updateRegistration,
  type RegistrationAnalytics,
  type RegistrationRow,
  type RegistrationStatus
} from '@/services/registrationsAdmin';

type StatCard = {
  title: string;
  value: string;
  subtitle: string;
  cardClass: string;
};

type ActionType = 'add' | 'view' | 'edit' | 'approve' | 'clear';

type PatientForm = {
  name: string;
  email: string;
  age: number;
  concern: string;
  assigned: string;
  intakeTime: string;
  bookedTime: string;
  status: RegistrationStatus;
};

const statusFilters = ['All Statuses', 'Pending', 'Active', 'Archived'];
const sortFilters = ['Sort Latest Intake', 'Sort Name A-Z', 'Sort Name Z-A'];
const statusItems: RegistrationStatus[] = ['Pending', 'Active', 'Archived'];
const pageSize = 6;

const records = ref<RegistrationRow[]>([]);
const analytics = ref<RegistrationAnalytics>({
  pending: 0,
  active: 0,
  concerns: 0,
  approvalRate: 0
});

const pageLoading = ref(true);
const pageReady = ref(false);
const listPage = ref(1);
const pageCount = ref(1);
const totalItems = ref(0);

const searchQuery = ref('');
const selectedStatus = ref('All Statuses');
const selectedSort = ref('Sort Latest Intake');

const actionDialog = ref(false);
const actionType = ref<ActionType>('view');
const actionRecord = ref<RegistrationRow | null>(null);
const actionLoading = ref(false);

const snackbar = ref(false);
const snackbarText = ref('');
const snackbarColor = ref<'success' | 'info' | 'warning' | 'error'>('success');

const patientForm = ref<PatientForm>({
  name: '',
  email: '',
  age: 18,
  concern: '',
  assigned: '',
  intakeTime: '',
  bookedTime: '',
  status: 'Pending'
});

const statCards = computed<StatCard[]>(() => [
  { title: 'Pending', value: String(analytics.value.pending), subtitle: 'Awaiting Action', cardClass: 'stat-green' },
  { title: 'Active', value: String(analytics.value.active), subtitle: 'Processed Records', cardClass: 'stat-blue' },
  { title: 'Concerns', value: String(analytics.value.concerns), subtitle: 'New Concerns', cardClass: 'stat-orange' },
  { title: 'Approval Rate', value: `${analytics.value.approvalRate}%`, subtitle: `Based on Totals (${totalItems.value})`, cardClass: 'stat-purple' }
]);

const activeCount = computed(() => analytics.value.active);
const pendingCount = computed(() => analytics.value.pending);

const totalCountText = computed(() => {
  if (totalItems.value === 0) return 'Showing 0-0 of 0';
  const first = (listPage.value - 1) * pageSize + 1;
  const last = Math.min(listPage.value * pageSize, totalItems.value);
  return `Showing ${first}-${last} of ${totalItems.value}`;
});

const modalTitle = computed(() => {
  if (actionType.value === 'add') return 'Add Patient';
  if (actionType.value === 'view') return 'View Patient Details';
  if (actionType.value === 'edit') return 'Edit Patient Record';
  if (actionType.value === 'approve') return 'Approve Patient';
  return 'Clear Filters';
});

const modalSubtitle = computed(() => {
  if (actionType.value === 'add') return 'Create a new registration intake entry.';
  if (actionType.value === 'view') return 'Review this record before taking any action.';
  if (actionType.value === 'edit') return 'Apply updates to this patient registration record.';
  if (actionType.value === 'approve') return 'This will set the selected patient status to Active.';
  return 'Reset search, status, and sort filters to default values.';
});

const modalActionText = computed(() => {
  if (actionType.value === 'add') return 'Add Patient';
  if (actionType.value === 'view') return 'Close';
  if (actionType.value === 'edit') return 'Save Changes';
  if (actionType.value === 'approve') return 'Approve Patient';
  return 'Reset Filters';
});

const modalActionIcon = computed(() => {
  if (actionType.value === 'add') return 'mdi-account-plus-outline';
  if (actionType.value === 'view') return 'mdi-check';
  if (actionType.value === 'edit') return 'mdi-content-save-outline';
  if (actionType.value === 'approve') return 'mdi-check-circle-outline';
  return 'mdi-filter-off-outline';
});

const pagedRecords = computed(() => records.value);

function formatDateTime(value: string): string {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
}

function toInputDateTime(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'PT';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

function statusColor(status: RegistrationStatus): string {
  if (status === 'Active') return 'success';
  if (status === 'Pending') return 'warning';
  return 'secondary';
}

function showToast(message: string, color: 'success' | 'info' | 'warning' | 'error' = 'success'): void {
  snackbarText.value = message;
  snackbarColor.value = color;
  snackbar.value = true;
}

async function loadRecords(): Promise<void> {
  try {
    const payload = await fetchRegistrations({
      search: searchQuery.value.trim(),
      status: selectedStatus.value,
      sort: selectedSort.value,
      page: listPage.value,
      perPage: pageSize
    });
    records.value = payload.items;
    analytics.value = payload.analytics;
    totalItems.value = payload.meta.total;
    pageCount.value = payload.meta.totalPages;
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error');
  }
}

function resetForm(): void {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  patientForm.value = {
    name: '',
    email: '',
    age: 18,
    concern: '',
    assigned: '',
    intakeTime: local,
    bookedTime: local,
    status: 'Pending'
  };
}

function copyRecordToForm(record: RegistrationRow): void {
  patientForm.value = {
    name: record.patient_name,
    email: record.patient_email || '',
    age: Number(record.age || 0),
    concern: record.concern || '',
    assigned: record.assigned_to || '',
    intakeTime: toInputDateTime(record.intake_time),
    bookedTime: toInputDateTime(record.booked_time),
    status: record.status
  };
}

function openActionModal(action: ActionType, record?: RegistrationRow): void {
  actionType.value = action;
  actionRecord.value = record || null;
  if (action === 'add') resetForm();
  if ((action === 'edit' || action === 'view') && record) copyRecordToForm(record);
  actionDialog.value = true;
}

function closeActionModal(): void {
  if (actionLoading.value) return;
  actionDialog.value = false;
}

function clearFilters(): void {
  searchQuery.value = '';
  selectedStatus.value = 'All Statuses';
  selectedSort.value = 'Sort Latest Intake';
  listPage.value = 1;
  void loadRecords();
}

async function handleModalAction(): Promise<void> {
  if (actionType.value === 'view') {
    actionDialog.value = false;
    return;
  }

  if (actionType.value === 'clear') {
    clearFilters();
    showToast('Filters reset.', 'info');
    actionDialog.value = false;
    return;
  }

  actionLoading.value = true;
  try {
    if (actionType.value === 'add') {
      await createRegistration({
        patient_name: patientForm.value.name,
        patient_email: patientForm.value.email,
        age: patientForm.value.age,
        concern: patientForm.value.concern,
        assigned_to: patientForm.value.assigned,
        intake_time: patientForm.value.intakeTime,
        booked_time: patientForm.value.bookedTime,
        status: patientForm.value.status
      });
      showToast('Patient added successfully.');
    }

    if (actionType.value === 'edit' && actionRecord.value) {
      await updateRegistration({
        id: actionRecord.value.id,
        patient_name: patientForm.value.name,
        patient_email: patientForm.value.email,
        age: patientForm.value.age,
        concern: patientForm.value.concern,
        assigned_to: patientForm.value.assigned,
        intake_time: patientForm.value.intakeTime,
        booked_time: patientForm.value.bookedTime,
        status: patientForm.value.status
      });
      showToast('Patient record updated.');
    }

    if (actionType.value === 'approve' && actionRecord.value) {
      await approveRegistration(actionRecord.value.id);
      showToast('Patient approved.', 'success');
    }

    actionDialog.value = false;
    await loadRecords();
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    actionLoading.value = false;
  }
}

watch([searchQuery, selectedStatus, selectedSort], () => {
  listPage.value = 1;
  void loadRecords();
});

watch(listPage, () => {
  void loadRecords();
});

onMounted(async () => {
  await loadRecords();
  pageLoading.value = false;
  requestAnimationFrame(() => {
    pageReady.value = true;
  });
});
</script>

<template>
  <div class="registration-page">
    <div v-if="pageLoading">
      <v-skeleton-loader type="heading, text" class="mb-5" />
      <v-row class="mb-4">
        <v-col cols="12" sm="6" lg="3" v-for="n in 4" :key="`stat-skeleton-${n}`">
          <v-skeleton-loader type="card" />
        </v-col>
      </v-row>
      <v-card variant="outlined">
        <v-card-text>
          <v-skeleton-loader type="text, text, table-heading, table-row-divider@6" />
        </v-card-text>
      </v-card>
    </div>

    <div v-else class="registration-content" :class="{ 'is-visible': pageReady }">
      <v-card class="hero-banner mb-4" elevation="0">
        <v-card-text class="pa-5">
          <div class="d-flex flex-wrap align-center justify-space-between ga-4">
            <div>
              <div class="hero-kicker">Clinical Operations</div>
              <h1 class="text-h4 font-weight-black mb-1">Registration (Patient Management)</h1>
              <p class="hero-subtitle mb-0">Manage patient details, intake records, and concerns.</p>
            </div>
            <div class="hero-side-card">
              <div class="hero-side-label">Patient Intake</div>
              <div class="hero-side-text">Review, update, and approve records from one queue.</div>
              <v-btn color="primary" variant="flat" prepend-icon="mdi-account-plus-outline" class="mt-2 saas-primary-btn" rounded="pill" @click="openActionModal('add')">Add Patient</v-btn>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <v-row class="mb-4">
        <v-col v-for="card in statCards" :key="card.title" cols="12" sm="6" lg="3">
          <v-card :class="['stats-card', card.cardClass]" elevation="0">
            <v-card-text>
              <div class="text-uppercase text-caption font-weight-bold">{{ card.title }}</div>
              <div class="stats-value">{{ card.value }}</div>
              <div class="stats-subtitle">{{ card.subtitle }}</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-card variant="outlined">
        <v-card-item>
          <v-card-title class="text-h4">Patient Records</v-card-title>
        </v-card-item>
        <v-card-text>
          <v-row class="mb-3">
            <v-col cols="12" md="6">
              <v-text-field
                v-model="searchQuery"
                density="comfortable"
                variant="outlined"
                hide-details
                prepend-inner-icon="mdi-magnify"
                placeholder="Search by patient name; email, registration number, or booked staff..."
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select :items="statusFilters" v-model="selectedStatus" density="comfortable" variant="outlined" hide-details prepend-inner-icon="mdi-filter-outline" />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select :items="sortFilters" v-model="selectedSort" density="comfortable" variant="outlined" hide-details prepend-inner-icon="mdi-sort" />
            </v-col>
          </v-row>

          <div class="mb-3 d-flex flex-wrap ga-2 align-center">
            <v-chip color="secondary" variant="tonal" size="small">Online Registration</v-chip>
            <v-chip color="primary" variant="tonal" size="small">Register Marion</v-chip>
            <v-chip color="warning" variant="tonal" size="small">Active: {{ activeCount }}</v-chip>
            <v-chip color="info" variant="tonal" size="small">Pending: {{ pendingCount }}</v-chip>
            <v-spacer />
            <v-btn size="small" variant="outlined" color="primary" rounded="pill" prepend-icon="mdi-filter-off-outline" class="saas-outline-btn" @click="openActionModal('clear')">Clear Filters</v-btn>
          </div>

          <v-table density="comfortable">
            <thead>
              <tr>
                <th>PATIENT</th>
                <th>CONCERN</th>
                <th>INTAKE TIME</th>
                <th>BOOKED TIME</th>
                <th>STATUS</th>
                <th>ASSIGNED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in pagedRecords" :key="record.id">
                <td>
                  <div class="d-flex align-center ga-3">
                    <v-avatar size="34" color="primary" variant="tonal">{{ toInitials(record.patient_name) }}</v-avatar>
                    <div>
                      <div class="font-weight-medium">{{ record.patient_name }} <span class="text-medium-emphasis">{{ record.age || '--' }}</span></div>
                      <div class="text-caption text-medium-emphasis">{{ record.patient_email || record.case_id }}</div>
                    </div>
                  </div>
                </td>
                <td>{{ record.concern || '--' }}</td>
                <td>{{ formatDateTime(record.intake_time) }}</td>
                <td>{{ formatDateTime(record.booked_time) }}</td>
                <td>
                  <v-chip size="small" :color="statusColor(record.status)" variant="tonal">{{ record.status }}</v-chip>
                </td>
                <td>{{ record.assigned_to }}</td>
                <td>
                  <div class="d-flex ga-2 flex-wrap align-center">
                    <v-btn icon size="small" class="saas-icon-btn" color="primary" variant="tonal" @click="openActionModal('view', record)">
                      <EyeIcon size="16" stroke-width="2.2" />
                    </v-btn>
                    <v-btn icon size="small" class="saas-icon-btn" color="indigo" variant="tonal" @click="openActionModal('edit', record)">
                      <EditIcon size="16" stroke-width="2.2" />
                    </v-btn>
                    <v-btn icon size="small" class="saas-icon-btn saas-approve-btn" color="success" variant="tonal" @click="openActionModal('approve', record)">
                      <CheckIcon size="16" stroke-width="2.4" />
                    </v-btn>
                  </div>
                </td>
              </tr>
              <tr v-if="pagedRecords.length === 0">
                <td colspan="7" class="text-center text-medium-emphasis py-5">No patient records match your filters.</td>
              </tr>
            </tbody>
          </v-table>

          <div class="d-flex align-center mt-3 text-medium-emphasis text-caption">
            <span>{{ totalCountText }}</span>
            <v-spacer />
            <v-pagination v-model="listPage" :length="pageCount" density="comfortable" total-visible="7" />
          </div>
        </v-card-text>
      </v-card>
    </div>

    <v-dialog v-model="actionDialog" max-width="620" class="action-dialog" transition="dialog-bottom-transition">
      <v-card class="action-modal-card">
        <v-card-title class="text-h4">{{ modalTitle }}</v-card-title>
        <v-card-subtitle>{{ modalSubtitle }}</v-card-subtitle>
        <v-card-text class="pt-4">
          <template v-if="actionType === 'view' && actionRecord">
            <v-list lines="one" density="compact">
              <v-list-item title="Case ID" :subtitle="actionRecord.case_id" />
              <v-list-item title="Patient" :subtitle="actionRecord.patient_name" />
              <v-list-item title="Age" :subtitle="String(actionRecord.age || '--')" />
              <v-list-item title="Concern" :subtitle="actionRecord.concern || '--'" />
              <v-list-item title="Assigned" :subtitle="actionRecord.assigned_to" />
              <v-list-item title="Status" :subtitle="actionRecord.status" />
              <v-list-item title="Intake Time" :subtitle="formatDateTime(actionRecord.intake_time)" />
              <v-list-item title="Booked Time" :subtitle="formatDateTime(actionRecord.booked_time)" />
            </v-list>
          </template>

          <template v-else-if="actionType === 'add' || actionType === 'edit'">
            <v-row>
              <v-col cols="12" md="7">
                <v-text-field v-model="patientForm.name" label="Patient Name" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="5">
                <v-text-field v-model.number="patientForm.age" type="number" label="Age" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="patientForm.email" label="Email" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="patientForm.assigned" label="Assigned Staff/Doctor" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12">
                <v-text-field v-model="patientForm.concern" label="Concern" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-select v-model="patientForm.status" :items="statusItems" label="Status" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="patientForm.intakeTime" type="datetime-local" label="Intake Time" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="patientForm.bookedTime" type="datetime-local" label="Booked Time" variant="outlined" density="comfortable" />
              </v-col>
            </v-row>
          </template>

          <template v-else-if="actionType === 'approve' && actionRecord">
            <v-alert type="warning" variant="tonal" class="mb-3" icon="mdi-check-circle-outline">
              You are about to approve <strong>{{ actionRecord.patient_name }}</strong>.
            </v-alert>
            <div class="text-medium-emphasis">Current status: <strong>{{ actionRecord.status }}</strong></div>
            <div class="text-medium-emphasis">New status after approval: <strong>Active</strong></div>
          </template>

          <template v-else-if="actionType === 'clear'">
            <v-alert type="info" variant="tonal" icon="mdi-filter-off-outline">Reset search, status, and sort filters to defaults?</v-alert>
          </template>
        </v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn variant="text" prepend-icon="mdi-close" @click="closeActionModal">Cancel</v-btn>
          <v-btn color="primary" variant="flat" rounded="pill" prepend-icon="mdi-check-circle-outline" :append-icon="modalActionIcon" :loading="actionLoading" class="saas-primary-btn" @click="handleModalAction">
            {{ modalActionText }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :timeout="2400" :color="snackbarColor">
      {{ snackbarText }}
    </v-snackbar>
  </div>
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

.hero-subtitle {
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 1px 2px rgba(8, 20, 52, 0.35);
}

.hero-side-card {
  min-width: 250px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  color: #14316e;
}

.hero-side-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.hero-side-text {
  margin-top: 4px;
  font-size: 13px;
}

.registration-content {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 320ms ease, transform 320ms ease;
}

.registration-content.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.stats-card {
  color: #fff;
  border-radius: 12px;
  box-shadow: 0 10px 24px rgba(12, 31, 60, 0.18);
  transition: transform 220ms ease, box-shadow 220ms ease;
}

.stats-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 26px rgba(12, 31, 60, 0.2);
}

.stat-green { background: linear-gradient(135deg, #23ba63 0%, #129a51 100%); }
.stat-blue { background: linear-gradient(135deg, #40a9f2 0%, #357adf 100%); }
.stat-orange { background: linear-gradient(135deg, #ff9800 0%, #ff6f00 100%); }
.stat-purple { background: linear-gradient(135deg, #a82cf0 0%, #7a1fca 100%); }

.stats-value {
  margin-top: 4px;
  font-size: 42px;
  line-height: 1.1;
  font-weight: 800;
}

.stats-subtitle {
  margin-top: 2px;
  opacity: 0.95;
}

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

.saas-icon-btn {
  border-radius: 10px;
  border: 1px solid rgba(69, 98, 175, 0.22) !important;
  box-shadow: 0 4px 12px rgba(23, 50, 103, 0.14);
}

.saas-approve-btn {
  border-color: rgba(0, 167, 93, 0.24) !important;
  box-shadow: 0 4px 12px rgba(0, 167, 93, 0.16);
}

.action-dialog :deep(.v-overlay__content) {
  transition: transform 220ms ease, opacity 220ms ease;
}

.action-modal-card {
  border-radius: 16px;
  overflow: hidden;
}
</style>
