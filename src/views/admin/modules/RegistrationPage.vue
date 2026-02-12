<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

type StatCard = {
  title: string;
  value: string;
  subtitle: string;
  cardClass: string;
};

type PatientStatus = 'Pending' | 'Active' | 'Archived';

type PatientRecord = {
  id: number;
  initials: string;
  name: string;
  age: number;
  concern: string;
  intakeTime: string;
  bookedTime: string;
  status: PatientStatus;
  assigned: string;
};

type ActionType = 'add' | 'view' | 'edit' | 'approve' | 'clear';

type PatientForm = {
  name: string;
  age: number;
  concern: string;
  assigned: string;
  intakeTime: string;
  bookedTime: string;
  status: PatientStatus;
};

const statCards: StatCard[] = [
  { title: 'Pending', value: '3', subtitle: 'Awaiting Action', cardClass: 'stat-green' },
  { title: 'Active', value: '11', subtitle: 'Processed Records', cardClass: 'stat-blue' },
  { title: 'Concerns', value: '4', subtitle: 'New Concerns', cardClass: 'stat-orange' },
  { title: 'Approval Rate', value: '72%', subtitle: 'Based on Totals (18)', cardClass: 'stat-purple' }
];

const statusFilters = ['All Statuses', 'Pending', 'Active', 'Archived'];
const sortFilters = ['Sort Latest Intake', 'Sort Name A-Z', 'Sort Name Z-A'];
const statusItems: PatientStatus[] = ['Pending', 'Active', 'Archived'];
const pageSize = 6;

const records = ref<PatientRecord[]>([
  {
    id: 1,
    initials: 'MS',
    name: 'Maria Santos',
    age: 34,
    concern: 'Back pain',
    intakeTime: 'Today at 10:45 AM',
    bookedTime: 'Today at 10:45 AM',
    status: 'Pending',
    assigned: 'Dr. Humour'
  },
  {
    id: 2,
    initials: 'JL',
    name: 'Juana Locsin',
    age: 31,
    concern: 'Headache',
    intakeTime: 'Yesterday at 8:00 AM',
    bookedTime: 'Yesterday at 9:00 AM',
    status: 'Active',
    assigned: 'Dr. Morco'
  },
  {
    id: 3,
    initials: 'GM',
    name: 'Gina Marquez',
    age: 41,
    concern: 'Anxiety',
    intakeTime: 'Feb 17, 2024 2:15 PM',
    bookedTime: 'February 17, 2024 2:15 PM',
    status: 'Active',
    assigned: 'Dr. Jenni'
  },
  {
    id: 4,
    initials: 'LM',
    name: 'Leo Magno',
    age: 45,
    concern: 'New Concern',
    intakeTime: 'Feb 16, 2024 4:50 PM',
    bookedTime: 'Feb 16, 2024 4:30 PM',
    status: 'Pending',
    assigned: 'Register Marion'
  },
  {
    id: 5,
    initials: 'JD',
    name: 'Juan Dela Cruz',
    age: 39,
    concern: 'Cold',
    intakeTime: 'Feb 15, 2024 11:20 AM',
    bookedTime: 'Feb 13, 11:20 AM',
    status: 'Pending',
    assigned: 'Dr. Humour'
  },
  {
    id: 6,
    initials: 'AP',
    name: 'Ana Perez',
    age: 27,
    concern: 'Archived',
    intakeTime: 'Feb 14, 2024 1:00 PM',
    bookedTime: 'Thu, Feb 14, 1:00 PM',
    status: 'Archived',
    assigned: 'Dr. S. Villaraza'
  }
]);

const pageLoading = ref(true);
const pageReady = ref(false);
const listPage = ref(1);
const searchQuery = ref('');
const selectedStatus = ref('All Statuses');
const selectedSort = ref('Sort Latest Intake');

const actionDialog = ref(false);
const actionType = ref<ActionType>('view');
const actionRecord = ref<PatientRecord | null>(null);
const actionLoading = ref(false);

const snackbar = ref(false);
const snackbarText = ref('');
const snackbarColor = ref<'success' | 'info' | 'warning'>('success');

const patientForm = ref<PatientForm>({
  name: '',
  age: 18,
  concern: '',
  assigned: '',
  intakeTime: '',
  bookedTime: '',
  status: 'Pending'
});

onMounted(() => {
  setTimeout(() => {
    pageLoading.value = false;
    requestAnimationFrame(() => {
      pageReady.value = true;
    });
  }, 700);
});

const filteredRecords = computed(() => {
  let rows = [...records.value];
  const query = searchQuery.value.trim().toLowerCase();

  if (query) {
    rows = rows.filter((record) => {
      const target = `${record.name} ${record.concern} ${record.assigned} ${record.intakeTime} ${record.bookedTime}`.toLowerCase();
      return target.includes(query);
    });
  }

  if (selectedStatus.value !== 'All Statuses') {
    rows = rows.filter((record) => record.status === selectedStatus.value);
  }

  if (selectedSort.value === 'Sort Name A-Z') {
    rows.sort((a, b) => a.name.localeCompare(b.name));
  } else if (selectedSort.value === 'Sort Name Z-A') {
    rows.sort((a, b) => b.name.localeCompare(a.name));
  } else {
    rows.sort((a, b) => b.id - a.id);
  }

  return rows;
});

const pagedRecords = computed(() => {
  const start = (listPage.value - 1) * pageSize;
  return filteredRecords.value.slice(start, start + pageSize);
});

const pageCount = computed(() => Math.max(1, Math.ceil(filteredRecords.value.length / pageSize)));
const activeCount = computed(() => records.value.filter((record) => record.status === 'Active').length);
const pendingCount = computed(() => records.value.filter((record) => record.status === 'Pending').length);
const totalCountText = computed(() => {
  if (filteredRecords.value.length === 0) {
    return 'Showing 0-0 of 0';
  }

  const first = (listPage.value - 1) * pageSize + 1;
  const last = Math.min(listPage.value * pageSize, filteredRecords.value.length);
  return `Showing ${first}-${last} of ${filteredRecords.value.length}`;
});

const modalTitle = computed(() => {
  if (actionType.value === 'add') return 'Add Patient';
  if (actionType.value === 'view') return 'View Patient Details';
  if (actionType.value === 'edit') return 'Edit Patient Record';
  if (actionType.value === 'approve') return 'Approve Patient';
  return 'Clear Filters';
});

const modalSubtitle = computed(() => {
  if (actionType.value === 'add') return 'Static form preview only. Data is local and not persisted to API.';
  if (actionType.value === 'view') return 'Review this record before taking any action.';
  if (actionType.value === 'edit') return 'Apply local changes to this row.';
  if (actionType.value === 'approve') return 'This will set the selected patient status to Active.';
  return 'Reset search, status, and sort filters to default values.';
});

const modalActionText = computed(() => {
  if (actionType.value === 'add') return 'Add';
  if (actionType.value === 'view') return 'Close';
  if (actionType.value === 'edit') return 'Save';
  if (actionType.value === 'approve') return 'Approve';
  return 'Reset';
});

watch(pageCount, (newPageCount) => {
  if (listPage.value > newPageCount) {
    listPage.value = newPageCount;
  }
});

watch([searchQuery, selectedStatus, selectedSort], () => {
  listPage.value = 1;
});

function statusColor(status: PatientRecord['status']): string {
  if (status === 'Active') return 'success';
  if (status === 'Pending') return 'warning';
  return 'secondary';
}

function toInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'PT';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

function resetForm(): void {
  patientForm.value = {
    name: '',
    age: 18,
    concern: '',
    assigned: '',
    intakeTime: '',
    bookedTime: '',
    status: 'Pending'
  };
}

function copyRecordToForm(record: PatientRecord): void {
  patientForm.value = {
    name: record.name,
    age: record.age,
    concern: record.concern,
    assigned: record.assigned,
    intakeTime: record.intakeTime,
    bookedTime: record.bookedTime,
    status: record.status
  };
}

function openActionModal(action: ActionType, record?: PatientRecord): void {
  actionType.value = action;
  actionRecord.value = record || null;

  if (action === 'add') {
    resetForm();
  }

  if ((action === 'edit' || action === 'view') && record) {
    copyRecordToForm(record);
  }

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
}

function showToast(message: string, color: 'success' | 'info' | 'warning' = 'success'): void {
  snackbarText.value = message;
  snackbarColor.value = color;
  snackbar.value = true;
}

function handleModalAction(): void {
  actionLoading.value = true;

  setTimeout(() => {
    if (actionType.value === 'add') {
      const nextId = records.value.length === 0 ? 1 : Math.max(...records.value.map((record) => record.id)) + 1;
      const newRecord: PatientRecord = {
        id: nextId,
        initials: toInitials(patientForm.value.name),
        name: patientForm.value.name || 'New Patient',
        age: patientForm.value.age || 18,
        concern: patientForm.value.concern || 'General Concern',
        intakeTime: patientForm.value.intakeTime || 'Today at 11:00 AM',
        bookedTime: patientForm.value.bookedTime || 'Today at 11:00 AM',
        status: patientForm.value.status,
        assigned: patientForm.value.assigned || 'Unassigned'
      };
      records.value.unshift(newRecord);
      showToast('Patient added (static local change).');
    } else if (actionType.value === 'edit' && actionRecord.value) {
      const rowIndex = records.value.findIndex((record) => record.id === actionRecord.value?.id);
      if (rowIndex >= 0) {
        records.value[rowIndex] = {
          ...records.value[rowIndex],
          initials: toInitials(patientForm.value.name),
          name: patientForm.value.name,
          age: patientForm.value.age,
          concern: patientForm.value.concern,
          assigned: patientForm.value.assigned,
          intakeTime: patientForm.value.intakeTime,
          bookedTime: patientForm.value.bookedTime,
          status: patientForm.value.status
        };
      }
      showToast('Patient record updated (static local change).');
    } else if (actionType.value === 'approve' && actionRecord.value) {
      const rowIndex = records.value.findIndex((record) => record.id === actionRecord.value?.id);
      if (rowIndex >= 0) {
        records.value[rowIndex].status = 'Active';
      }
      showToast('Patient approved (status set to Active).');
    } else if (actionType.value === 'clear') {
      clearFilters();
      showToast('Filters reset.', 'info');
    } else {
      showToast('Action preview complete.', 'info');
    }

    actionLoading.value = false;
    actionDialog.value = false;
  }, 350);
}
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
              <div class="hero-side-text">Use static actions to review, update, and approve records.</div>
              <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" class="mt-2" @click="openActionModal('add')">Add Patient</v-btn>
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
              <v-select :items="statusFilters" v-model="selectedStatus" density="comfortable" variant="outlined" hide-details />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select :items="sortFilters" v-model="selectedSort" density="comfortable" variant="outlined" hide-details />
            </v-col>
          </v-row>

          <div class="mb-3 d-flex flex-wrap ga-2">
            <v-chip color="secondary" variant="tonal" size="small">Online Registration</v-chip>
            <v-chip color="primary" variant="tonal" size="small">Register Marion</v-chip>
            <v-chip color="warning" variant="tonal" size="small">Active: {{ activeCount }}</v-chip>
            <v-chip color="info" variant="tonal" size="small">Pending: {{ pendingCount }}</v-chip>
            <v-spacer />
            <v-btn size="small" variant="text" color="primary" prepend-icon="mdi-refresh" @click="openActionModal('clear')">Clear Filters</v-btn>
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
                    <v-avatar size="34" color="primary" variant="tonal">{{ record.initials }}</v-avatar>
                    <div>
                      <div class="font-weight-medium">{{ record.name }} <span class="text-medium-emphasis">{{ record.age }}</span></div>
                      <div class="text-caption text-medium-emphasis">{{ record.assigned }}</div>
                    </div>
                  </div>
                </td>
                <td>{{ record.concern }}</td>
                <td>{{ record.intakeTime }}</td>
                <td>{{ record.bookedTime }}</td>
                <td>
                  <v-chip size="small" :color="statusColor(record.status)" variant="tonal">{{ record.status }}</v-chip>
                </td>
                <td>{{ record.assigned }}</td>
                <td>
                  <div class="d-flex ga-1 flex-wrap">
                    <v-btn size="x-small" color="primary" variant="flat" @click="openActionModal('view', record)">View</v-btn>
                    <v-btn size="x-small" color="secondary" variant="flat" @click="openActionModal('edit', record)">Edit</v-btn>
                    <v-btn size="x-small" color="error" variant="flat" @click="openActionModal('approve', record)">Approve</v-btn>
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

    <v-dialog v-model="actionDialog" max-width="560" class="action-dialog" transition="dialog-bottom-transition">
      <v-card class="action-modal-card">
        <v-card-title class="text-h4">{{ modalTitle }}</v-card-title>
        <v-card-subtitle>{{ modalSubtitle }}</v-card-subtitle>
        <v-card-text class="pt-4">
          <template v-if="actionType === 'view' && actionRecord">
            <v-list lines="one" density="compact">
              <v-list-item title="Patient" :subtitle="actionRecord.name" />
              <v-list-item title="Age" :subtitle="String(actionRecord.age)" />
              <v-list-item title="Concern" :subtitle="actionRecord.concern" />
              <v-list-item title="Assigned" :subtitle="actionRecord.assigned" />
              <v-list-item title="Status" :subtitle="actionRecord.status" />
              <v-list-item title="Intake Time" :subtitle="actionRecord.intakeTime" />
              <v-list-item title="Booked Time" :subtitle="actionRecord.bookedTime" />
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
              <v-col cols="12">
                <v-text-field v-model="patientForm.concern" label="Concern" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="patientForm.assigned" label="Assigned Staff/Doctor" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-select v-model="patientForm.status" :items="statusItems" label="Status" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="patientForm.intakeTime" label="Intake Time" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="patientForm.bookedTime" label="Booked Time" variant="outlined" density="comfortable" />
              </v-col>
            </v-row>
          </template>

          <template v-else-if="actionType === 'approve' && actionRecord">
            <v-alert type="warning" variant="tonal" class="mb-3">
              You are about to approve <strong>{{ actionRecord.name }}</strong>.
            </v-alert>
            <div class="text-medium-emphasis">Current status: <strong>{{ actionRecord.status }}</strong></div>
            <div class="text-medium-emphasis">New status after approval: <strong>Active</strong></div>
          </template>

          <template v-else-if="actionType === 'clear'">
            <v-alert type="info" variant="tonal">Reset search, status, and sort filters to defaults?</v-alert>
          </template>
        </v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn variant="text" @click="closeActionModal">Cancel</v-btn>
          <v-btn color="primary" variant="flat" :loading="actionLoading" @click="handleModalAction">
            {{ modalActionText }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :timeout="2200" :color="snackbarColor">
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

.stat-green {
  background: linear-gradient(135deg, #23ba63 0%, #129a51 100%);
}

.stat-blue {
  background: linear-gradient(135deg, #40a9f2 0%, #357adf 100%);
}

.stat-orange {
  background: linear-gradient(135deg, #ff9800 0%, #ff6f00 100%);
}

.stat-purple {
  background: linear-gradient(135deg, #a82cf0 0%, #7a1fca 100%);
}

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

.action-dialog :deep(.v-overlay__content) {
  transition: transform 220ms ease, opacity 220ms ease;
}

.action-modal-card {
  border-radius: 16px;
  overflow: hidden;
}
</style>
