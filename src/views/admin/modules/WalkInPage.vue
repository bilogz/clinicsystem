<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

type Severity = 'Low' | 'Moderate' | 'Emergency';
type WalkInStatus = 'triage_pending' | 'waiting_for_doctor' | 'consultation' | 'completed' | 'emergency';

type WalkInCase = {
  id: string;
  patientName: string;
  age: number;
  contact: string;
  chiefComplaint: string;
  severity: Severity;
  intakeTime: string;
  assignedDoctor: string;
  status: WalkInStatus;
};

type ActionType = 'new' | 'identify' | 'triage' | 'assign' | 'complete' | 'emergency';

type WalkInForm = {
  patientName: string;
  age: number;
  contact: string;
  complaint: string;
  severity: Severity;
  assignedDoctor: string;
};

const loadingPage = ref(true);
const pageVisible = ref(false);
const searchQuery = ref('');
const statusFilter = ref<'All' | WalkInStatus>('All');
const severityFilter = ref<'All' | Severity>('All');
const queuePage = ref(1);
const pageSize = 5;

const dialogOpen = ref(false);
const dialogAction = ref<ActionType>('new');
const dialogCase = ref<WalkInCase | null>(null);
const dialogLoading = ref(false);

const snackbar = ref(false);
const snackbarText = ref('');
const snackbarColor = ref<'success' | 'warning' | 'info'>('success');

const walkInCases = ref<WalkInCase[]>([
  {
    id: 'WALK-2026-101',
    patientName: 'Mario Santos',
    age: 42,
    contact: '0917-123-4411',
    chiefComplaint: 'Mild dizziness and headache',
    severity: 'Moderate',
    intakeTime: '10:12 AM',
    assignedDoctor: 'Dr. Humour',
    status: 'waiting_for_doctor'
  },
  {
    id: 'WALK-2026-102',
    patientName: 'Juana Reyes',
    age: 27,
    contact: '0916-994-1209',
    chiefComplaint: 'Small hand laceration',
    severity: 'Low',
    intakeTime: '10:28 AM',
    assignedDoctor: 'Nurse Triage',
    status: 'triage_pending'
  },
  {
    id: 'WALK-2026-103',
    patientName: 'Rico Dela Cruz',
    age: 56,
    contact: '0920-334-7781',
    chiefComplaint: 'Chest discomfort, shortness of breath',
    severity: 'Emergency',
    intakeTime: '10:31 AM',
    assignedDoctor: 'ER Team',
    status: 'emergency'
  },
  {
    id: 'WALK-2026-104',
    patientName: 'Ana Perez',
    age: 33,
    contact: '0919-331-8880',
    chiefComplaint: 'Fever and persistent cough',
    severity: 'Moderate',
    intakeTime: '9:55 AM',
    assignedDoctor: 'Dr. Jenni',
    status: 'consultation'
  },
  {
    id: 'WALK-2026-099',
    patientName: 'Leo Magno',
    age: 24,
    contact: '0918-776-4022',
    chiefComplaint: 'Minor ankle sprain',
    severity: 'Low',
    intakeTime: '9:31 AM',
    assignedDoctor: 'Dr. Morco',
    status: 'completed'
  }
]);

const caseForm = ref<WalkInForm>({
  patientName: '',
  age: 18,
  contact: '',
  complaint: '',
  severity: 'Low',
  assignedDoctor: ''
});

onMounted(() => {
  setTimeout(() => {
    loadingPage.value = false;
    requestAnimationFrame(() => {
      pageVisible.value = true;
    });
  }, 700);
});

const totals = computed(() => {
  const all = walkInCases.value.length;
  const triage = walkInCases.value.filter((item) => item.status === 'triage_pending').length;
  const doctor = walkInCases.value.filter((item) => item.status === 'waiting_for_doctor' || item.status === 'consultation').length;
  const emergency = walkInCases.value.filter((item) => item.status === 'emergency').length;
  const completed = walkInCases.value.filter((item) => item.status === 'completed').length;
  return { all, triage, doctor, emergency, completed };
});

const filteredCases = computed(() => {
  let rows = [...walkInCases.value];
  const query = searchQuery.value.trim().toLowerCase();

  if (query) {
    rows = rows.filter((item) => {
      const target = `${item.id} ${item.patientName} ${item.contact} ${item.chiefComplaint} ${item.assignedDoctor}`.toLowerCase();
      return target.includes(query);
    });
  }

  if (statusFilter.value !== 'All') {
    rows = rows.filter((item) => item.status === statusFilter.value);
  }

  if (severityFilter.value !== 'All') {
    rows = rows.filter((item) => item.severity === severityFilter.value);
  }

  return rows.sort((a, b) => (a.id < b.id ? 1 : -1));
});

const queueLength = computed(() => Math.max(1, Math.ceil(filteredCases.value.length / pageSize)));
const pagedCases = computed(() => {
  const start = (queuePage.value - 1) * pageSize;
  return filteredCases.value.slice(start, start + pageSize);
});

watch(queueLength, (newValue) => {
  if (queuePage.value > newValue) queuePage.value = newValue;
});

watch([statusFilter, severityFilter, searchQuery], () => {
  queuePage.value = 1;
});

const dialogTitle = computed(() => {
  if (dialogAction.value === 'new') return 'New Walk-In';
  if (dialogAction.value === 'identify') return 'Patient Identification';
  if (dialogAction.value === 'triage') return 'Intake / Triage';
  if (dialogAction.value === 'assign') return 'Assign Doctor';
  if (dialogAction.value === 'complete') return 'Mark as Complete';
  return 'Emergency Escalation';
});

const dialogActionText = computed(() => {
  if (dialogAction.value === 'new') return 'Create';
  if (dialogAction.value === 'identify') return 'Load Patient';
  if (dialogAction.value === 'triage') return 'Save Triage';
  if (dialogAction.value === 'assign') return 'Assign';
  if (dialogAction.value === 'complete') return 'Complete';
  return 'Escalate';
});

function statusColor(status: WalkInStatus): string {
  if (status === 'completed') return 'success';
  if (status === 'emergency') return 'error';
  if (status === 'consultation') return 'primary';
  if (status === 'waiting_for_doctor') return 'warning';
  return 'secondary';
}

function severityColor(severity: Severity): string {
  if (severity === 'Emergency') return 'error';
  if (severity === 'Moderate') return 'warning';
  return 'success';
}

function statusLabel(status: WalkInStatus): string {
  return status.replace(/_/g, ' ');
}

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'PT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function resetForm(): void {
  caseForm.value = {
    patientName: '',
    age: 18,
    contact: '',
    complaint: '',
    severity: 'Low',
    assignedDoctor: ''
  };
}

function applyCaseToForm(item: WalkInCase): void {
  caseForm.value = {
    patientName: item.patientName,
    age: item.age,
    contact: item.contact,
    complaint: item.chiefComplaint,
    severity: item.severity,
    assignedDoctor: item.assignedDoctor
  };
}

function openAction(action: ActionType, item?: WalkInCase): void {
  dialogAction.value = action;
  dialogCase.value = item || null;

  if (action === 'new') {
    resetForm();
  } else if (item) {
    applyCaseToForm(item);
  }

  dialogOpen.value = true;
}

function closeAction(): void {
  if (dialogLoading.value) return;
  dialogOpen.value = false;
}

function showToast(message: string, color: 'success' | 'warning' | 'info' = 'success'): void {
  snackbarText.value = message;
  snackbarColor.value = color;
  snackbar.value = true;
}

function executeAction(): void {
  dialogLoading.value = true;

  setTimeout(() => {
    if (dialogAction.value === 'new') {
      const nextId = `WALK-2026-${String(Math.max(...walkInCases.value.map((item) => Number(item.id.split('-')[2]))) + 1).padStart(3, '0')}`;
      walkInCases.value.unshift({
        id: nextId,
        patientName: caseForm.value.patientName || 'New Walk-In',
        age: caseForm.value.age || 18,
        contact: caseForm.value.contact || 'N/A',
        chiefComplaint: caseForm.value.complaint || 'General walk-in concern',
        severity: caseForm.value.severity,
        intakeTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        assignedDoctor: caseForm.value.assignedDoctor || 'Nurse Triage',
        status: 'triage_pending'
      });
      showToast('Walk-in case created (static only).');
    } else if (dialogCase.value) {
      const row = walkInCases.value.find((item) => item.id === dialogCase.value?.id);
      if (row) {
        if (dialogAction.value === 'identify') {
          row.status = 'triage_pending';
          showToast(`Patient profile loaded for ${row.patientName}.`, 'info');
        } else if (dialogAction.value === 'triage') {
          row.chiefComplaint = caseForm.value.complaint || row.chiefComplaint;
          row.severity = caseForm.value.severity;
          row.status = caseForm.value.severity === 'Emergency' ? 'emergency' : 'waiting_for_doctor';
          showToast('Triage details saved (static local update).');
        } else if (dialogAction.value === 'assign') {
          row.assignedDoctor = caseForm.value.assignedDoctor || row.assignedDoctor;
          row.status = 'consultation';
          showToast(`Assigned ${row.patientName} to ${row.assignedDoctor}.`);
        } else if (dialogAction.value === 'complete') {
          row.status = 'completed';
          showToast(`Marked ${row.patientName} as completed.`);
        } else if (dialogAction.value === 'emergency') {
          row.status = 'emergency';
          row.severity = 'Emergency';
          row.assignedDoctor = 'ER Team';
          showToast(`${row.patientName} escalated to emergency.`, 'warning');
        }
      }
    }

    dialogLoading.value = false;
    dialogOpen.value = false;
  }, 360);
}
</script>

<template>
  <div class="walkin-page">
    <div v-if="loadingPage">
      <v-skeleton-loader type="heading, text" class="mb-4" />
      <v-row class="mb-4">
        <v-col cols="12" sm="6" lg="3" v-for="n in 4" :key="`walkin-skeleton-${n}`">
          <v-skeleton-loader type="card" />
        </v-col>
      </v-row>
      <v-card variant="outlined" class="mb-4">
        <v-card-text>
          <v-skeleton-loader type="text, text, text, paragraph" />
        </v-card-text>
      </v-card>
      <v-card variant="outlined">
        <v-card-text>
          <v-skeleton-loader type="table-heading, table-row-divider@6" />
        </v-card-text>
      </v-card>
    </div>

    <div v-else class="walkin-content" :class="{ 'is-visible': pageVisible }">
      <v-row class="mb-4">
        <v-col cols="12" md="8">
          <h1 class="text-h3 font-weight-bold mb-1">Walk-In Clinic Operations</h1>
          <p class="text-subtitle-2 text-medium-emphasis mb-0">Operational flow for handling unscheduled patient visits.</p>
        </v-col>
        <v-col cols="12" md="4" class="d-flex justify-md-end align-center">
          <v-btn color="primary" prepend-icon="mdi-account-plus" @click="openAction('new')">New Walk-In</v-btn>
        </v-col>
      </v-row>

      <v-row class="mb-4">
        <v-col cols="12" sm="6" lg="3">
          <v-card class="metric-card metric-blue" elevation="0">
            <v-card-text>
              <div class="metric-label">Total Queue</div>
              <div class="metric-value">{{ totals.all }}</div>
              <div class="metric-subtitle">All active and completed</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <v-card class="metric-card metric-indigo" elevation="0">
            <v-card-text>
              <div class="metric-label">Triage Pending</div>
              <div class="metric-value">{{ totals.triage }}</div>
              <div class="metric-subtitle">Needs intake assessment</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <v-card class="metric-card metric-orange" elevation="0">
            <v-card-text>
              <div class="metric-label">Waiting / Consult</div>
              <div class="metric-value">{{ totals.doctor }}</div>
              <div class="metric-subtitle">Doctor assignment in progress</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <v-card class="metric-card metric-red" elevation="0">
            <v-card-text>
              <div class="metric-label">Emergency</div>
              <div class="metric-value">{{ totals.emergency }}</div>
              <div class="metric-subtitle">Immediate priority queue</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-card variant="outlined">
        <v-card-item>
          <v-card-title>Live Walk-In Queue (Static Simulation)</v-card-title>
        </v-card-item>
        <v-card-text>
          <v-row class="mb-3">
            <v-col cols="12" md="6">
              <v-text-field
                v-model="searchQuery"
                density="comfortable"
                variant="outlined"
                prepend-inner-icon="mdi-magnify"
                hide-details
                placeholder="Search by case id, patient, concern, or doctor..."
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select
                :items="['All', 'triage_pending', 'waiting_for_doctor', 'consultation', 'completed', 'emergency']"
                v-model="statusFilter"
                density="comfortable"
                variant="outlined"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select :items="['All', 'Low', 'Moderate', 'Emergency']" v-model="severityFilter" density="comfortable" variant="outlined" hide-details />
            </v-col>
          </v-row>

          <v-table density="comfortable">
            <thead>
              <tr>
                <th>CASE ID</th>
                <th>PATIENT</th>
                <th>COMPLAINT</th>
                <th>SEVERITY</th>
                <th>STATUS</th>
                <th>DOCTOR</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pagedCases" :key="item.id">
                <td class="font-weight-medium">{{ item.id }}</td>
                <td>
                  <div class="d-flex align-center ga-2">
                    <v-avatar size="30" color="primary" variant="tonal">{{ toInitials(item.patientName) }}</v-avatar>
                    <div>
                      <div class="font-weight-medium">{{ item.patientName }} <span class="text-medium-emphasis">{{ item.age }}</span></div>
                      <div class="text-caption text-medium-emphasis">{{ item.contact }} • {{ item.intakeTime }}</div>
                    </div>
                  </div>
                </td>
                <td>{{ item.chiefComplaint }}</td>
                <td>
                  <v-chip size="small" variant="tonal" :color="severityColor(item.severity)">{{ item.severity }}</v-chip>
                </td>
                <td>
                  <v-chip size="small" variant="tonal" :color="statusColor(item.status)">{{ statusLabel(item.status) }}</v-chip>
                </td>
                <td>{{ item.assignedDoctor }}</td>
                <td>
                  <div class="d-flex ga-1 flex-wrap">
                    <v-btn size="x-small" variant="flat" color="secondary" @click="openAction('identify', item)">Identify</v-btn>
                    <v-btn size="x-small" variant="flat" color="primary" @click="openAction('triage', item)">Triage</v-btn>
                    <v-btn size="x-small" variant="flat" color="warning" @click="openAction('assign', item)">Assign</v-btn>
                    <v-btn size="x-small" variant="flat" color="success" @click="openAction('complete', item)">Complete</v-btn>
                    <v-btn size="x-small" variant="flat" color="error" @click="openAction('emergency', item)">Emergency</v-btn>
                  </div>
                </td>
              </tr>
              <tr v-if="pagedCases.length === 0">
                <td colspan="7" class="text-center text-medium-emphasis py-5">No walk-in cases found for the selected filters.</td>
              </tr>
            </tbody>
          </v-table>

          <div class="d-flex align-center mt-3 text-caption text-medium-emphasis">
            <span>Showing {{ pagedCases.length }} of {{ filteredCases.length }} cases</span>
            <v-spacer />
            <v-pagination v-model="queuePage" :length="queueLength" density="comfortable" total-visible="7" />
          </div>
        </v-card-text>
      </v-card>
    </div>

    <v-dialog v-model="dialogOpen" max-width="620" transition="dialog-bottom-transition">
      <v-card class="walkin-dialog-card">
        <v-card-title class="text-h4">{{ dialogTitle }}</v-card-title>
        <v-card-subtitle>Static flow action. Backend integration will be connected later.</v-card-subtitle>
        <v-card-text class="pt-4">
          <template v-if="dialogAction === 'new' || dialogAction === 'triage' || dialogAction === 'assign'">
            <v-row>
              <v-col cols="12" md="7">
                <v-text-field v-model="caseForm.patientName" label="Patient Name" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="5">
                <v-text-field v-model.number="caseForm.age" type="number" label="Age" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="caseForm.contact" label="Contact Number" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-select :items="['Low', 'Moderate', 'Emergency']" v-model="caseForm.severity" label="Severity" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12">
                <v-text-field v-model="caseForm.complaint" label="Chief Complaint" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12">
                <v-text-field v-model="caseForm.assignedDoctor" label="Assigned Doctor/Staff" variant="outlined" density="comfortable" />
              </v-col>
            </v-row>
          </template>

          <template v-else-if="dialogAction === 'identify' && dialogCase">
            <v-alert type="info" variant="tonal" class="mb-3">
              Loading existing profile for <strong>{{ dialogCase.patientName }}</strong> ({{ dialogCase.id }}).
            </v-alert>
            <div class="text-medium-emphasis">This action sets status to <strong>triage_pending</strong>.</div>
          </template>

          <template v-else-if="dialogAction === 'complete' && dialogCase">
            <v-alert type="success" variant="tonal" class="mb-3">
              Mark <strong>{{ dialogCase.patientName }}</strong> as completed?
            </v-alert>
            <div class="text-medium-emphasis">Current doctor: <strong>{{ dialogCase.assignedDoctor }}</strong></div>
          </template>

          <template v-else-if="dialogAction === 'emergency' && dialogCase">
            <v-alert type="error" variant="tonal" class="mb-3">
              Escalate <strong>{{ dialogCase.patientName }}</strong> to emergency queue now?
            </v-alert>
            <div class="text-medium-emphasis">This will prioritize the case and assign <strong>ER Team</strong>.</div>
          </template>
        </v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn variant="text" @click="closeAction">Cancel</v-btn>
          <v-btn color="primary" variant="flat" :loading="dialogLoading" @click="executeAction">{{ dialogActionText }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="2200">
      {{ snackbarText }}
    </v-snackbar>
  </div>
</template>

<style scoped>
.walkin-content {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 320ms ease, transform 320ms ease;
}

.walkin-content.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.metric-card {
  color: #fff;
  border-radius: 12px;
  box-shadow: 0 10px 24px rgba(12, 31, 60, 0.18);
  transition: transform 220ms ease, box-shadow 220ms ease;
}

.metric-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 26px rgba(12, 31, 60, 0.2);
}

.metric-blue {
  background: linear-gradient(135deg, #40a9f2 0%, #357adf 100%);
}

.metric-indigo {
  background: linear-gradient(135deg, #5a6de2 0%, #3949ab 100%);
}

.metric-orange {
  background: linear-gradient(135deg, #ff9800 0%, #ff6f00 100%);
}

.metric-red {
  background: linear-gradient(135deg, #ef5350 0%, #e53935 100%);
}

.metric-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
}

.metric-value {
  margin-top: 4px;
  font-size: 38px;
  line-height: 1.1;
  font-weight: 800;
}

.metric-subtitle {
  margin-top: 2px;
  opacity: 0.95;
}

.walkin-dialog-card {
  border-radius: 16px;
  overflow: hidden;
}
</style>
