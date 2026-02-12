<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

type VisitStatus = 'waiting_for_doctor' | 'in_queue' | 'in_consultation' | 'lab_pending' | 'pharmacy_pending' | 'completed' | 'emergency';
type VisitSource = 'appointment_confirmed' | 'walkin_triage_completed' | 'waiting_for_doctor';

type CheckUpVisit = {
  id: string;
  patientName: string;
  assignedDoctor: string;
  source: VisitSource;
  status: VisitStatus;
  chiefComplaint: string;
  diagnosis: string;
  clinicalNotes: string;
  consultationStartedAt: string;
  consultationSaved: boolean;
  labRequested: boolean;
  labResultReady: boolean;
  prescriptionCreated: boolean;
  prescriptionDispensed: boolean;
  followUpDate: string;
};

type ActivityLog = {
  timestamp: string;
  visitId: string;
  action: string;
  detail: string;
};

const loadingPage = ref(true);
const pageVisible = ref(false);
const currentDoctor = ref('Dr. Humour');
const selectedVisitId = ref<string | null>(null);
const workspaceDialog = ref(false);
const toast = ref(false);
const toastText = ref('');
const toastColor = ref<'success' | 'warning' | 'info' | 'error'>('info');

const visits = ref<CheckUpVisit[]>([
  {
    id: 'VISIT-2026-2001',
    patientName: 'Maria Santos',
    assignedDoctor: 'Dr. Humour',
    source: 'appointment_confirmed',
    status: 'waiting_for_doctor',
    chiefComplaint: 'Fever with sore throat',
    diagnosis: '',
    clinicalNotes: '',
    consultationStartedAt: '',
    consultationSaved: false,
    labRequested: false,
    labResultReady: false,
    prescriptionCreated: false,
    prescriptionDispensed: false,
    followUpDate: ''
  },
  {
    id: 'VISIT-2026-2002',
    patientName: 'Rico Dela Cruz',
    assignedDoctor: 'Dr. Humour',
    source: 'walkin_triage_completed',
    status: 'in_queue',
    chiefComplaint: 'Persistent headache',
    diagnosis: '',
    clinicalNotes: '',
    consultationStartedAt: '',
    consultationSaved: false,
    labRequested: false,
    labResultReady: false,
    prescriptionCreated: false,
    prescriptionDispensed: false,
    followUpDate: ''
  },
  {
    id: 'VISIT-2026-2003',
    patientName: 'Juana Reyes',
    assignedDoctor: 'Dr. Jenni',
    source: 'waiting_for_doctor',
    status: 'in_consultation',
    chiefComplaint: 'Back pain',
    diagnosis: 'Muscle strain',
    clinicalNotes: 'Pain localized at lower back, no neuro deficits.',
    consultationStartedAt: '10:42 AM',
    consultationSaved: true,
    labRequested: true,
    labResultReady: false,
    prescriptionCreated: false,
    prescriptionDispensed: false,
    followUpDate: ''
  }
]);

const draft = reactive({
  diagnosis: '',
  clinicalNotes: '',
  followUpDate: '',
  requestLab: false,
  createPrescription: false
});

const activityLogs = ref<ActivityLog[]>([]);

onMounted(() => {
  setTimeout(() => {
    loadingPage.value = false;
    pageVisible.value = true;
    if (visits.value.length > 0) {
      selectedVisitId.value = visits.value[0].id;
    }
  }, 650);
});

const selectedVisit = computed(() => visits.value.find((visit) => visit.id === selectedVisitId.value) || null);
const canOpenWorkspace = computed(() => Boolean(selectedVisit.value));

watch(selectedVisit, (visit) => {
  if (!visit) return;
  draft.diagnosis = visit.diagnosis;
  draft.clinicalNotes = visit.clinicalNotes;
  draft.followUpDate = visit.followUpDate;
  draft.requestLab = visit.labRequested;
  draft.createPrescription = visit.prescriptionCreated;
});

const statusCounts = computed(() => {
  return {
    inQueue: visits.value.filter((visit) => visit.status === 'in_queue').length,
    consultation: visits.value.filter((visit) => visit.status === 'in_consultation').length,
    lab: visits.value.filter((visit) => visit.status === 'lab_pending').length,
    pharmacy: visits.value.filter((visit) => visit.status === 'pharmacy_pending').length,
    completed: visits.value.filter((visit) => visit.status === 'completed').length,
    emergency: visits.value.filter((visit) => visit.status === 'emergency').length
  };
});

function logAction(visitId: string, action: string, detail: string): void {
  activityLogs.value.unshift({
    timestamp: new Date().toLocaleString(),
    visitId,
    action,
    detail
  });
}

function showToast(message: string, color: 'success' | 'warning' | 'info' | 'error' = 'info'): void {
  toastText.value = message;
  toastColor.value = color;
  toast.value = true;
}

function statusLabel(status: VisitStatus): string {
  return status.replace(/_/g, ' ');
}

function sourceLabel(source: VisitSource): string {
  return source.replace(/_/g, ' ');
}

function sourceColor(source: VisitSource): string {
  if (source === 'appointment_confirmed') return 'primary';
  if (source === 'walkin_triage_completed') return 'warning';
  return 'secondary';
}

function statusColor(status: VisitStatus): string {
  if (status === 'completed') return 'success';
  if (status === 'emergency') return 'error';
  if (status === 'in_consultation') return 'primary';
  if (status === 'lab_pending') return 'warning';
  if (status === 'pharmacy_pending') return 'secondary';
  if (status === 'in_queue') return 'info';
  return 'default';
}

function isAssignedDoctor(visit: CheckUpVisit): boolean {
  return visit.assignedDoctor === currentDoctor.value;
}

function openWorkspace(visitId?: string): void {
  if (visitId) {
    selectedVisitId.value = visitId;
  }

  if (!selectedVisit.value) {
    showToast('Select a visit first to open the consultation workspace.', 'warning');
    return;
  }

  workspaceDialog.value = true;
}

function canQueueEntry(visit: CheckUpVisit): boolean {
  return visit.status === 'waiting_for_doctor';
}

function canStartConsultation(visit: CheckUpVisit): boolean {
  return visit.status === 'in_queue' && isAssignedDoctor(visit);
}

function canSaveConsultation(visit: CheckUpVisit): boolean {
  return isAssignedDoctor(visit) && (visit.status === 'in_consultation' || visit.status === 'lab_pending');
}

function canMarkLabResult(visit: CheckUpVisit): boolean {
  return visit.status === 'lab_pending' && visit.labRequested;
}

function canSendToPharmacy(visit: CheckUpVisit): boolean {
  if (!visit.consultationSaved) return false;
  if (visit.labRequested && !visit.labResultReady) return false;
  return true;
}

function canMarkDispensed(visit: CheckUpVisit): boolean {
  return visit.status === 'pharmacy_pending' && visit.prescriptionCreated;
}

function canCompleteVisit(visit: CheckUpVisit): boolean {
  if (!visit.consultationSaved) return false;
  if (visit.labRequested && !visit.labResultReady) return false;
  if (visit.prescriptionCreated && !visit.prescriptionDispensed) return false;
  return true;
}

function queueEntry(): void {
  const visit = selectedVisit.value;
  if (!visit) return;

  if (!['waiting_for_doctor'].includes(visit.status)) {
    showToast('Queue entry only allowed from waiting_for_doctor status.', 'warning');
    return;
  }

  visit.status = 'in_queue';
  logAction(visit.id, 'queue_entry', 'Visit added to doctor queue.');
  showToast('Visit moved to in_queue.', 'success');
}

function startConsultation(): void {
  const visit = selectedVisit.value;
  if (!visit) return;

  if (!isAssignedDoctor(visit)) {
    showToast('Only the assigned doctor can start this consultation.', 'error');
    return;
  }

  if (visit.status !== 'in_queue') {
    showToast('Consultation can only start from in_queue.', 'warning');
    return;
  }

  visit.status = 'in_consultation';
  visit.consultationStartedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  logAction(visit.id, 'start_consultation', 'Consultation started and visit lock applied.');
  showToast('Consultation started.', 'success');
}

function saveConsultation(): void {
  const visit = selectedVisit.value;
  if (!visit) return;

  if (!isAssignedDoctor(visit)) {
    showToast('Only the assigned doctor can modify consultation.', 'error');
    return;
  }

  if (visit.status !== 'in_consultation' && visit.status !== 'lab_pending') {
    showToast('Consultation save is only valid during consultation or lab review.', 'warning');
    return;
  }

  if (!draft.diagnosis.trim() || !draft.clinicalNotes.trim()) {
    showToast('Diagnosis and clinical notes are required before saving.', 'error');
    return;
  }

  visit.diagnosis = draft.diagnosis.trim();
  visit.clinicalNotes = draft.clinicalNotes.trim();
  visit.followUpDate = draft.followUpDate;
  visit.consultationSaved = true;

  if (draft.requestLab) {
    visit.labRequested = true;
    visit.labResultReady = false;
    visit.status = 'lab_pending';
    logAction(visit.id, 'request_lab', 'Lab request created. Status set to lab_pending.');
    showToast('Consultation saved with lab request.', 'success');
    return;
  }

  if (draft.createPrescription) {
    visit.prescriptionCreated = true;
    visit.status = 'pharmacy_pending';
    logAction(visit.id, 'create_prescription', 'Prescription created. Status set to pharmacy_pending.');
    showToast('Consultation saved with prescription.', 'success');
    return;
  }

  visit.status = 'completed';
  logAction(visit.id, 'complete_consultation', 'Consultation completed with no lab/prescription.');
  showToast('Consultation completed (no medication, no lab).', 'success');
}

function markLabResultReady(): void {
  const visit = selectedVisit.value;
  if (!visit) return;

  if (visit.status !== 'lab_pending' || !visit.labRequested) {
    showToast('No pending lab request to complete.', 'warning');
    return;
  }

  visit.labResultReady = true;
  visit.status = 'in_consultation';
  logAction(visit.id, 'lab_result_ready', 'Lab result posted. Returned to consultation review.');
  showToast('Lab result posted. Doctor can finalize plan.', 'info');
}

function sendToPharmacy(): void {
  const visit = selectedVisit.value;
  if (!visit) return;

  if (!visit.consultationSaved) {
    showToast('Save consultation before sending to pharmacy.', 'warning');
    return;
  }

  if (visit.labRequested && !visit.labResultReady) {
    showToast('Cannot send to pharmacy until lab result is available.', 'error');
    return;
  }

  visit.prescriptionCreated = true;
  visit.status = 'pharmacy_pending';
  logAction(visit.id, 'pharmacy_pending', 'Prescription routed to pharmacy.');
  showToast('Visit routed to pharmacy.', 'success');
}

function markDispensed(): void {
  const visit = selectedVisit.value;
  if (!visit) return;

  if (visit.status !== 'pharmacy_pending' || !visit.prescriptionCreated) {
    showToast('No pending prescription to dispense.', 'warning');
    return;
  }

  visit.prescriptionDispensed = true;
  logAction(visit.id, 'dispensed', 'Medication dispensed and inventory deduction simulated.');
  showToast('Medication dispensed (inventory deduction simulated).', 'success');
}

function completeVisit(): void {
  const visit = selectedVisit.value;
  if (!visit) return;

  if (!visit.consultationSaved) {
    showToast('Consultation must be saved before completion.', 'error');
    return;
  }

  if (visit.labRequested && !visit.labResultReady) {
    showToast('Cannot complete: lab was requested but result is missing.', 'error');
    return;
  }

  if (visit.prescriptionCreated && !visit.prescriptionDispensed) {
    showToast('Cannot complete: prescription exists but not dispensed.', 'error');
    return;
  }

  visit.status = 'completed';
  logAction(visit.id, 'completed', 'Visit marked as completed.');

  if (visit.followUpDate) {
    logAction(visit.id, 'follow_up_created', `Follow-up appointment auto-created for ${visit.followUpDate}.`);
  }

  showToast('Visit completed successfully.', 'success');
}

function escalateEmergency(): void {
  const visit = selectedVisit.value;
  if (!visit) return;
  visit.status = 'emergency';
  logAction(visit.id, 'emergency_flag', 'Emergency flag applied and priority routing triggered.');
  showToast('Visit escalated to emergency.', 'warning');
}
</script>

<template>
  <div class="checkup-page">
    <div v-if="loadingPage">
      <v-skeleton-loader type="heading, text" class="mb-4" />
      <v-row class="mb-4">
        <v-col cols="12" sm="6" lg="2" v-for="n in 6" :key="`stat-${n}`">
          <v-skeleton-loader type="card" />
        </v-col>
      </v-row>
      <v-row>
        <v-col cols="12" lg="7">
          <v-skeleton-loader type="image, paragraph, paragraph" />
        </v-col>
        <v-col cols="12" lg="5">
          <v-skeleton-loader type="image, paragraph" />
        </v-col>
      </v-row>
      <v-skeleton-loader type="table-heading, table-row-divider@5, paragraph" class="mt-4" />
    </div>

    <div v-else class="checkup-content" :class="{ 'is-visible': pageVisible }">
      <v-card class="hero-card mb-4" elevation="0">
        <v-card-text class="pa-6">
          <v-row align="center">
            <v-col cols="12" md="8" lg="9">
              <div class="hero-kicker">Clinical Operations</div>
              <h1 class="text-h3 font-weight-black mb-2">Check-Up Consultation Center</h1>
              <p class="text-subtitle-1 mb-4 hero-subtitle">
                Manage queue intake, doctor consultation, lab review, pharmacy routing, and completion in one flow.
              </p>
              <v-btn
                color="white"
                size="large"
                variant="flat"
                class="open-workspace-btn"
                prepend-icon="mdi-stethoscope"
                :disabled="!canOpenWorkspace"
                @click="openWorkspace()"
              >
                Open Consultation Workspace
              </v-btn>
            </v-col>
            <v-col cols="12" md="4" lg="3" class="d-flex justify-md-end">
              <div class="doctor-badge">
                <div class="text-caption text-uppercase font-weight-bold">Assigned Session Doctor</div>
                <div class="text-h5 font-weight-bold">{{ currentDoctor }}</div>
                <div class="text-caption text-medium-emphasis">Only assigned doctor can modify consultation</div>
              </div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-row class="mb-4">
        <v-col cols="12" sm="6" lg="2">
          <v-card class="metric-card metric-queue" elevation="0">
            <v-card-text>
              <div class="metric-label">In Queue</div>
              <div class="metric-value">{{ statusCounts.inQueue }}</div>
              <div class="metric-subtitle">Awaiting doctor start</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="2">
          <v-card class="metric-card metric-consult" elevation="0">
            <v-card-text>
              <div class="metric-label">Consultation</div>
              <div class="metric-value">{{ statusCounts.consultation }}</div>
              <div class="metric-subtitle">Active doctor session</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="2">
          <v-card class="metric-card metric-lab" elevation="0">
            <v-card-text>
              <div class="metric-label">Lab Pending</div>
              <div class="metric-value">{{ statusCounts.lab }}</div>
              <div class="metric-subtitle">Awaiting lab result</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="2">
          <v-card class="metric-card metric-pharmacy" elevation="0">
            <v-card-text>
              <div class="metric-label">Pharmacy</div>
              <div class="metric-value">{{ statusCounts.pharmacy }}</div>
              <div class="metric-subtitle">Waiting dispensing</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="2">
          <v-card class="metric-card metric-complete" elevation="0">
            <v-card-text>
              <div class="metric-label">Completed</div>
              <div class="metric-value">{{ statusCounts.completed }}</div>
              <div class="metric-subtitle">Closed consultations</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="2">
          <v-card class="metric-card metric-emergency" elevation="0">
            <v-card-text>
              <div class="metric-label">Emergency</div>
              <div class="metric-value">{{ statusCounts.emergency }}</div>
              <div class="metric-subtitle">Priority escalation</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-row class="mb-4">
        <v-col cols="12">
          <v-card class="surface-card h-100" variant="outlined">
            <v-card-item>
              <v-card-title>Doctor Queue Board</v-card-title>
              <v-card-subtitle>Select a patient then open consultation workspace in modal</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <v-table density="comfortable">
                <thead>
                  <tr>
                    <th>VISIT ID</th>
                    <th>PATIENT</th>
                    <th>SOURCE</th>
                    <th>STATUS</th>
                    <th>DOCTOR</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="visit in visits" :key="visit.id" :class="{ 'selected-row': selectedVisitId === visit.id }">
                    <td class="font-weight-medium">{{ visit.id }}</td>
                    <td>{{ visit.patientName }}</td>
                    <td>
                      <v-chip size="x-small" :color="sourceColor(visit.source)" variant="tonal">{{ sourceLabel(visit.source) }}</v-chip>
                    </td>
                    <td>
                      <v-chip size="small" :color="statusColor(visit.status)" variant="tonal">{{ statusLabel(visit.status) }}</v-chip>
                    </td>
                    <td>{{ visit.assignedDoctor }}</td>
                    <td class="text-right">
                      <div class="d-flex justify-end ga-2">
                        <v-btn size="small" variant="outlined" color="primary" @click="selectedVisitId = visit.id">Select</v-btn>
                        <v-btn size="small" variant="flat" color="primary" prepend-icon="mdi-stethoscope" @click="openWorkspace(visit.id)">
                          Open
                        </v-btn>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-card class="surface-card" variant="outlined">
        <v-card-item><v-card-title>Activity Logs</v-card-title></v-card-item>
        <v-card-text>
          <v-table density="compact">
            <thead>
              <tr>
                <th>TIME</th>
                <th>VISIT</th>
                <th>ACTION</th>
                <th>DETAIL</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in activityLogs" :key="`${log.timestamp}-${log.visitId}-${log.action}`">
                <td>{{ log.timestamp }}</td>
                <td>{{ log.visitId }}</td>
                <td><v-chip size="x-small" color="primary" variant="tonal">{{ log.action }}</v-chip></td>
                <td>{{ log.detail }}</td>
              </tr>
              <tr v-if="activityLogs.length === 0">
                <td colspan="4" class="text-center text-medium-emphasis py-4">No activity yet. Use workspace actions to simulate the check-up flow.</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </div>

    <v-dialog v-model="workspaceDialog" max-width="1100" transition="dialog-bottom-transition" scrollable>
      <v-card class="workspace-modal" v-if="selectedVisit">
        <v-toolbar class="workspace-toolbar" density="comfortable">
          <v-toolbar-title class="font-weight-bold">Consultation Workspace</v-toolbar-title>
          <v-chip size="small" color="primary" variant="flat">{{ selectedVisit.id }}</v-chip>
          <v-btn icon="mdi-close" variant="text" @click="workspaceDialog = false" />
        </v-toolbar>

        <v-card-text class="pa-6">
          <v-row class="mb-2">
            <v-col cols="12" md="8">
              <div class="text-h5 font-weight-bold">{{ selectedVisit.patientName }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ selectedVisit.chiefComplaint }}</div>
              <div class="d-flex flex-wrap ga-2 mt-3">
                <v-chip size="small" :color="statusColor(selectedVisit.status)" variant="flat">{{ statusLabel(selectedVisit.status) }}</v-chip>
                <v-chip size="small" :color="sourceColor(selectedVisit.source)" variant="tonal">{{ sourceLabel(selectedVisit.source) }}</v-chip>
                <v-chip size="small" color="secondary" variant="tonal">Assigned: {{ selectedVisit.assignedDoctor }}</v-chip>
              </div>
            </v-col>
            <v-col cols="12" md="4">
              <v-card class="pa-4 h-100 modal-status-card" variant="tonal">
                <div class="text-caption text-uppercase font-weight-bold mb-2">Consultation Flags</div>
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="text-body-2">Lab Requested</span>
                  <v-chip size="x-small" :color="selectedVisit.labRequested ? 'warning' : 'default'" variant="flat">
                    {{ selectedVisit.labRequested ? 'Yes' : 'No' }}
                  </v-chip>
                </div>
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="text-body-2">Prescription</span>
                  <v-chip size="x-small" :color="selectedVisit.prescriptionCreated ? 'info' : 'default'" variant="flat">
                    {{ selectedVisit.prescriptionCreated ? 'Created' : 'Not created' }}
                  </v-chip>
                </div>
                <div class="d-flex align-center justify-space-between">
                  <span class="text-body-2">Dispensed</span>
                  <v-chip size="x-small" :color="selectedVisit.prescriptionDispensed ? 'success' : 'default'" variant="flat">
                    {{ selectedVisit.prescriptionDispensed ? 'Done' : 'Pending' }}
                  </v-chip>
                </div>
              </v-card>
            </v-col>
          </v-row>

          <v-row>
            <v-col cols="12">
              <v-text-field v-model="draft.diagnosis" label="Diagnosis (Required)" variant="outlined" density="comfortable" hide-details="auto" />
            </v-col>
            <v-col cols="12">
              <v-textarea
                v-model="draft.clinicalNotes"
                label="Clinical Notes (Required)"
                variant="outlined"
                density="comfortable"
                rows="4"
                hide-details="auto"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="draft.followUpDate"
                label="Follow-Up Date (Optional)"
                type="date"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
              />
            </v-col>
            <v-col cols="12" md="3" class="d-flex align-center">
              <v-switch v-model="draft.requestLab" label="Request Lab" color="warning" hide-details />
            </v-col>
            <v-col cols="12" md="3" class="d-flex align-center">
              <v-switch v-model="draft.createPrescription" label="Create Rx" color="primary" hide-details />
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <div class="text-subtitle-1 font-weight-bold mb-3">Quick Actions</div>
          <div class="action-grid">
            <v-btn
              class="action-btn"
              color="primary"
              variant="tonal"
              size="large"
              prepend-icon="mdi-playlist-check"
              :disabled="!canQueueEntry(selectedVisit)"
              @click="queueEntry"
            >
              Queue Entry
            </v-btn>
            <v-btn
              class="action-btn"
              color="indigo"
              variant="flat"
              size="large"
              prepend-icon="mdi-stethoscope"
              :disabled="!canStartConsultation(selectedVisit)"
              @click="startConsultation"
            >
              Start Check-Up
            </v-btn>
            <v-btn
              class="action-btn"
              color="secondary"
              variant="flat"
              size="large"
              prepend-icon="mdi-content-save"
              :disabled="!canSaveConsultation(selectedVisit)"
              @click="saveConsultation"
            >
              Save Consultation
            </v-btn>
            <v-btn
              class="action-btn"
              color="warning"
              variant="flat"
              size="large"
              prepend-icon="mdi-flask-outline"
              :disabled="!canMarkLabResult(selectedVisit)"
              @click="markLabResultReady"
            >
              Mark Lab Result Ready
            </v-btn>
            <v-btn
              class="action-btn"
              color="info"
              variant="flat"
              size="large"
              prepend-icon="mdi-pill"
              :disabled="!canSendToPharmacy(selectedVisit)"
              @click="sendToPharmacy"
            >
              Send To Pharmacy
            </v-btn>
            <v-btn
              class="action-btn"
              color="success"
              variant="flat"
              size="large"
              prepend-icon="mdi-check-circle"
              :disabled="!canMarkDispensed(selectedVisit)"
              @click="markDispensed"
            >
              Mark Dispensed
            </v-btn>
            <v-btn
              class="action-btn"
              color="success"
              variant="outlined"
              size="large"
              prepend-icon="mdi-clipboard-check-outline"
              :disabled="!canCompleteVisit(selectedVisit)"
              @click="completeVisit"
            >
              Complete Visit
            </v-btn>
            <v-btn class="action-btn" color="error" variant="flat" size="large" prepend-icon="mdi-alert" @click="escalateEmergency">
              Escalate Emergency
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="toast" :color="toastColor" :timeout="2200">{{ toastText }}</v-snackbar>
  </div>
</template>

<style scoped>
.checkup-page {
  background: radial-gradient(1200px 580px at 5% -10%, rgba(53, 122, 223, 0.12), transparent 62%),
    radial-gradient(900px 520px at 96% 0%, rgba(168, 44, 240, 0.1), transparent 60%);
}

.checkup-content {
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 280ms ease, transform 280ms ease;
}

.checkup-content.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.hero-card {
  border-radius: 18px;
  color: #fff;
  background: linear-gradient(120deg, #11256f 0%, #2957be 45%, #3ca0ef 100%);
  box-shadow: 0 18px 40px rgba(19, 44, 123, 0.25);
}

.hero-kicker {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  margin-bottom: 10px;
  font-size: 12px;
  letter-spacing: 0.8px;
  font-weight: 800;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.32);
}

.hero-subtitle {
  max-width: 700px;
  color: rgba(255, 255, 255, 0.92) !important;
}

.open-workspace-btn {
  color: #173267 !important;
  font-weight: 700;
}

.doctor-badge {
  min-width: 280px;
  background: rgba(255, 255, 255, 0.95);
  color: #1c2d64;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 8px 18px rgba(18, 41, 104, 0.18);
}

.metric-card {
  border-radius: 12px;
  color: #fff;
  box-shadow: 0 10px 24px rgba(16, 36, 88, 0.18);
  transition: transform 220ms ease, box-shadow 220ms ease;
}

.metric-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 30px rgba(16, 36, 88, 0.24);
}

.metric-queue {
  background: linear-gradient(135deg, #2f80ed 0%, #3a55d1 100%);
}

.metric-consult {
  background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
}

.metric-lab {
  background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
}

.metric-pharmacy {
  background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
}

.metric-complete {
  background: linear-gradient(135deg, #22c55e 0%, #15803d 100%);
}

.metric-emergency {
  background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
}

.metric-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-weight: 700;
}

.metric-value {
  font-size: 36px;
  line-height: 1.1;
  font-weight: 800;
}

.metric-subtitle {
  opacity: 0.92;
}

.surface-card {
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
}

.selected-row {
  background: rgba(59, 130, 246, 0.08);
}

.workspace-modal {
  border-radius: 18px;
  overflow: hidden;
}

.workspace-toolbar {
  color: #fff;
  background: linear-gradient(120deg, #1f3c9d 0%, #397adf 100%);
}

.modal-status-card {
  border: 1px solid rgba(90, 116, 180, 0.18);
  background: linear-gradient(180deg, #f7faff 0%, #eef4ff 100%);
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.action-btn {
  justify-content: flex-start;
  min-height: 44px;
  text-transform: none;
  font-weight: 700;
}

@media (max-width: 1260px) {
  .action-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .action-grid {
    grid-template-columns: 1fr;
  }

  .doctor-badge {
    min-width: 100%;
  }
}
</style>
