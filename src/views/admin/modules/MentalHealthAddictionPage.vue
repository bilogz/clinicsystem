<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

type SessionStatus = 'Active' | 'Follow-Up' | 'Completed' | 'At Risk';

type SessionItem = {
  caseId: string;
  patientName: string;
  patientId: string;
  counselor: string;
  sessionType: string;
  status: SessionStatus;
  nextFollowUp: string;
  lastSessionDate: string;
  riskStatus: 'Low' | 'Moderate' | 'High';
};

const kpiCards = [
  { title: 'Active Sessions', value: '18', icon: 'mdi-account-heart-outline', tone: 'kpi-blue' },
  { title: 'Follow-Ups Scheduled', value: '24', icon: 'mdi-calendar-check-outline', tone: 'kpi-cyan' },
  { title: 'Completed Today', value: '7', icon: 'mdi-check-decagram-outline', tone: 'kpi-green' },
  { title: 'At-Risk Patients', value: '5', icon: 'mdi-alert-outline', tone: 'kpi-amber' },
  { title: 'Priority Escalations', value: '2', icon: 'mdi-flag-outline', tone: 'kpi-red' }
];

const statusTabs = [
  { key: 'all', label: 'All', count: 42 },
  { key: 'active', label: 'Active', count: 18 },
  { key: 'follow_up', label: 'Follow-Up', count: 14 },
  { key: 'completed', label: 'Completed', count: 8 },
  { key: 'at_risk', label: 'At Risk', count: 5 }
] as const;

const quickStatus = ref('All');
const quickDateRange = ref('Last 30 Days');

const search = ref('');
const counselorFilter = ref('All');
const sessionTypeFilter = ref('All');
const statusFilter = ref('All');
const dateRangeFilter = ref('Last 30 Days');
const activeTab = ref<(typeof statusTabs)[number]['key']>('all');

const quickStatusItems = ['All', 'Active', 'Follow-Up', 'Completed', 'At Risk'];
const dateRangeItems = ['Today', 'Last 7 Days', 'Last 30 Days', 'This Quarter'];

const sessions = ref<SessionItem[]>([
  {
    caseId: 'MH-2401',
    patientName: 'Maria Santos',
    patientId: 'PAT-3401',
    counselor: 'Dr. Rivera',
    sessionType: 'Individual Counseling',
    status: 'Active',
    nextFollowUp: 'Feb 14, 2026',
    lastSessionDate: 'Feb 10, 2026',
    riskStatus: 'Moderate'
  },
  {
    caseId: 'MH-2397',
    patientName: 'John Reyes',
    patientId: 'PAT-3119',
    counselor: 'Dr. Molina',
    sessionType: 'Substance Recovery',
    status: 'At Risk',
    nextFollowUp: 'Feb 13, 2026',
    lastSessionDate: 'Feb 11, 2026',
    riskStatus: 'High'
  },
  {
    caseId: 'MH-2389',
    patientName: 'Emma Tan',
    patientId: 'PAT-2977',
    counselor: 'Dr. Rivera',
    sessionType: 'Family Session',
    status: 'Follow-Up',
    nextFollowUp: 'Feb 15, 2026',
    lastSessionDate: 'Feb 09, 2026',
    riskStatus: 'Low'
  },
  {
    caseId: 'MH-2374',
    patientName: 'Alex Chua',
    patientId: 'PAT-2674',
    counselor: 'Dr. Dela Cruz',
    sessionType: 'Group Therapy',
    status: 'Completed',
    nextFollowUp: 'Feb 20, 2026',
    lastSessionDate: 'Feb 08, 2026',
    riskStatus: 'Low'
  },
  {
    caseId: 'MH-2366',
    patientName: 'Lara Gomez',
    patientId: 'PAT-2509',
    counselor: 'Dr. Molina',
    sessionType: 'Individual Counseling',
    status: 'Active',
    nextFollowUp: 'Feb 16, 2026',
    lastSessionDate: 'Feb 12, 2026',
    riskStatus: 'Moderate'
  },
  {
    caseId: 'MH-2358',
    patientName: 'Mark Reyes',
    patientId: 'PAT-2844',
    counselor: 'Dr. Dela Cruz',
    sessionType: 'Substance Recovery',
    status: 'Follow-Up',
    nextFollowUp: 'Feb 18, 2026',
    lastSessionDate: 'Feb 07, 2026',
    riskStatus: 'Moderate'
  }
]);

const upcomingFollowUps = ref([
  { patient: 'Maria Santos', caseId: 'MH-2401', schedule: 'Feb 14, 2026 - 9:30 AM' },
  { patient: 'John Reyes', caseId: 'MH-2397', schedule: 'Feb 13, 2026 - 11:00 AM' },
  { patient: 'Emma Tan', caseId: 'MH-2389', schedule: 'Feb 15, 2026 - 2:00 PM' }
]);

const recentNotes = ref([
  { patient: 'Lara Gomez', note: 'Improved sleep quality over past week.', author: 'Dr. Molina', date: 'Feb 12, 2026' },
  { patient: 'Mark Reyes', note: 'Needs relapse prevention reinforcement.', author: 'Dr. Dela Cruz', date: 'Feb 11, 2026' },
  { patient: 'Maria Santos', note: 'Mood journaling started.', author: 'Dr. Rivera', date: 'Feb 10, 2026' },
  { patient: 'John Reyes', note: 'Escalation check done with guardian.', author: 'Dr. Molina', date: 'Feb 10, 2026' },
  { patient: 'Emma Tan', note: 'Family support plan reviewed.', author: 'Dr. Rivera', date: 'Feb 09, 2026' }
]);

const riskAlerts = ref([
  { patient: 'John Reyes', reason: 'Withdrawal risk reported', level: 'High' },
  { patient: 'Maria Santos', reason: 'Anxiety spike this week', level: 'Moderate' },
  { patient: 'Mark Reyes', reason: 'Missed prior follow-up', level: 'Moderate' }
]);

const activityPreview = ref([
  { title: 'Session Updated', detail: 'MH-2401 notes refreshed by Dr. Rivera', time: '10 mins ago' },
  { title: 'Follow-Up Scheduled', detail: 'MH-2397 follow-up set for Feb 13', time: '32 mins ago' },
  { title: 'Risk Flag Reviewed', detail: 'MH-2358 marked for counselor review', time: '1 hour ago' }
]);

const toast = reactive({
  open: false,
  text: '',
  color: 'info'
});

const newSessionModal = ref(false);
const sessionDetailsModal = ref(false);
const addNotesModal = ref(false);
const followUpModal = ref(false);

const detailsTab = ref('overview');
const selectedSession = ref<SessionItem | null>(null);

const newSessionForm = reactive({
  patient: '',
  sessionType: '',
  counselor: '',
  dateTime: '',
  notes: ''
});

const noteForm = reactive({
  noteType: 'Progress',
  content: '',
  markAtRisk: false
});

const followUpForm = reactive({
  dateTime: '',
  reminder: true,
  notes: ''
});

const counselorItems = computed(() => ['All', ...Array.from(new Set(sessions.value.map((item) => item.counselor)))]);
const sessionTypeItems = computed(() => ['All', ...Array.from(new Set(sessions.value.map((item) => item.sessionType)))]);
const statusItems = ['All', 'Active', 'Follow-Up', 'Completed', 'At Risk'];

const visibleSessions = computed(() => {
  const query = search.value.trim().toLowerCase();

  return sessions.value.filter((item) => {
    if (activeTab.value !== 'all') {
      if (activeTab.value === 'active' && item.status !== 'Active') return false;
      if (activeTab.value === 'follow_up' && item.status !== 'Follow-Up') return false;
      if (activeTab.value === 'completed' && item.status !== 'Completed') return false;
      if (activeTab.value === 'at_risk' && item.status !== 'At Risk') return false;
    }

    if (counselorFilter.value !== 'All' && item.counselor !== counselorFilter.value) return false;
    if (sessionTypeFilter.value !== 'All' && item.sessionType !== sessionTypeFilter.value) return false;
    if (statusFilter.value !== 'All' && item.status !== statusFilter.value) return false;
    if (quickStatus.value !== 'All' && item.status !== quickStatus.value) return false;

    if (!query) return true;

    const target = `${item.caseId} ${item.patientName} ${item.counselor} ${item.sessionType} ${item.patientId}`.toLowerCase();
    return target.includes(query);
  });
});

function statusTone(status: SessionStatus): string {
  if (status === 'Active') return 'primary';
  if (status === 'Follow-Up') return 'info';
  if (status === 'Completed') return 'success';
  return 'error';
}

function clearFilters(): void {
  search.value = '';
  counselorFilter.value = 'All';
  sessionTypeFilter.value = 'All';
  statusFilter.value = 'All';
  quickStatus.value = 'All';
  quickDateRange.value = 'Last 30 Days';
  dateRangeFilter.value = 'Last 30 Days';
  activeTab.value = 'all';
  showToast('Filters cleared.', 'info');
}

function reloadView(): void {
  showToast('Preview reloaded.', 'success');
}

function openSessionDetails(session: SessionItem): void {
  selectedSession.value = session;
  detailsTab.value = 'overview';
  sessionDetailsModal.value = true;
}

function openNotes(session: SessionItem): void {
  selectedSession.value = session;
  noteForm.noteType = 'Progress';
  noteForm.content = '';
  noteForm.markAtRisk = false;
  addNotesModal.value = true;
}

function openFollowUp(session: SessionItem): void {
  selectedSession.value = session;
  followUpForm.dateTime = '';
  followUpForm.reminder = true;
  followUpForm.notes = '';
  followUpModal.value = true;
}

function createSessionPreview(): void {
  newSessionModal.value = false;
  showToast('Session created (static preview).', 'success');
}

function saveNotePreview(): void {
  addNotesModal.value = false;
  showToast('Note saved (static preview).', 'success');
}

function scheduleFollowUpPreview(): void {
  followUpModal.value = false;
  showToast('Follow-up scheduled (static preview).', 'success');
}

function exportPreview(): void {
  showToast('Export started (static preview).', 'info');
}

function showToast(text: string, color: 'success' | 'info' | 'warning' | 'error'): void {
  toast.text = text;
  toast.color = color;
  toast.open = true;
}
</script>

<template>
  <div class="mental-health-page">
    <v-card class="hero-card section-gap" elevation="0">
      <v-card-text class="pa-4">
        <div class="d-flex flex-wrap align-center justify-space-between ga-3">
          <div>
            <h1 class="text-h4 font-weight-black mb-1">Mental Health & Addiction</h1>
            <p class="text-body-1 hero-subtitle mb-0">Manage counseling sessions, track patient progress, and schedule follow-ups.</p>
          </div>
          <div class="d-flex flex-wrap align-center ga-2">
            <v-select v-model="quickStatus" :items="quickStatusItems" label="Status" variant="outlined" density="compact" class="quick-filter" hide-details />
            <v-select v-model="quickDateRange" :items="dateRangeItems" label="Date Range" variant="outlined" density="compact" class="quick-filter" hide-details />
            <v-btn class="saas-btn saas-btn-primary saas-btn-sm" prepend-icon="mdi-plus" @click="newSessionModal = true">New Session</v-btn>
            <v-btn class="saas-btn saas-btn-ghost saas-btn-sm" prepend-icon="mdi-file-export-outline" @click="exportPreview">Export</v-btn>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <div class="kpi-grid section-gap">
      <v-card v-for="card in kpiCards" :key="card.title" class="kpi-card" :class="card.tone" elevation="0">
        <v-card-text class="kpi-content">
          <v-avatar size="34" variant="tonal" color="white">
            <v-icon :icon="card.icon" size="18" />
          </v-avatar>
          <div>
            <div class="kpi-title">{{ card.title }}</div>
            <div class="kpi-value">{{ card.value }}</div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <v-card class="surface-card section-gap" variant="outlined">
      <v-card-text class="pa-3">
        <v-row class="filters-row">
          <v-col cols="12" md="4">
            <v-text-field
              v-model="search"
              prepend-inner-icon="mdi-magnify"
              label="Search patient name, case ID, counselor..."
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-select v-model="counselorFilter" :items="counselorItems" label="Counselor" variant="outlined" density="compact" hide-details />
          </v-col>
          <v-col cols="12" md="2">
            <v-select v-model="sessionTypeFilter" :items="sessionTypeItems" label="Session Type" variant="outlined" density="compact" hide-details />
          </v-col>
          <v-col cols="12" md="2">
            <v-select v-model="statusFilter" :items="statusItems" label="Status" variant="outlined" density="compact" hide-details />
          </v-col>
          <v-col cols="12" md="2">
            <v-select v-model="dateRangeFilter" :items="dateRangeItems" label="Date Range" variant="outlined" density="compact" hide-details />
          </v-col>
        </v-row>
        <div class="d-flex justify-end flex-wrap ga-2 mt-1">
          <v-btn class="saas-btn saas-btn-ghost saas-btn-sm" prepend-icon="mdi-filter-off-outline" @click="clearFilters">Clear Filters</v-btn>
          <v-btn class="saas-btn saas-btn-light saas-btn-sm" prepend-icon="mdi-refresh" @click="reloadView">Reload</v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-row class="section-gap">
      <v-col cols="12" lg="8">
        <v-card class="surface-card h-100" variant="outlined">
          <v-card-item>
            <v-card-title>Counseling Sessions</v-card-title>
          </v-card-item>
          <v-card-text class="pt-1">
            <div class="tab-strip mb-1">
              <button v-for="tab in statusTabs" :key="tab.key" class="tab-btn" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
                {{ tab.label }}
                <span class="tab-badge">{{ tab.count }}</span>
              </button>
            </div>

            <div class="d-none d-md-block">
              <v-table density="compact" class="session-table">
                <thead>
                  <tr>
                    <th>CASE ID</th>
                    <th>PATIENT</th>
                    <th>COUNSELOR</th>
                    <th>SESSION TYPE</th>
                    <th>STATUS</th>
                    <th>NEXT FOLLOW-UP</th>
                    <th class="text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in visibleSessions" :key="item.caseId" class="session-row">
                    <td><span class="case-id">{{ item.caseId }}</span></td>
                    <td>
                      <div class="font-weight-bold">{{ item.patientName }}</div>
                      <div class="text-caption text-medium-emphasis">{{ item.patientId }}</div>
                    </td>
                    <td>{{ item.counselor }}</td>
                    <td>{{ item.sessionType }}</td>
                    <td><v-chip size="x-small" class="status-chip" :color="statusTone(item.status)" variant="tonal">{{ item.status }}</v-chip></td>
                    <td>{{ item.nextFollowUp }}</td>
                    <td class="text-right">
                      <div class="d-inline-flex ga-1 align-center flex-wrap justify-end">
                        <v-tooltip text="View Session" location="top">
                          <template #activator="{ props }">
                            <v-btn
                              v-bind="props"
                              size="small"
                              class="saas-btn action-icon-btn"
                              color="primary"
                              variant="tonal"
                              icon="$eye"
                              @click="openSessionDetails(item)"
                            />
                          </template>
                        </v-tooltip>
                        <v-tooltip text="Add Notes" location="top">
                          <template #activator="{ props }">
                            <v-btn
                              v-bind="props"
                              size="small"
                              class="saas-btn action-icon-btn action-btn-secondary"
                              color="secondary"
                              variant="outlined"
                              icon="$noteTextOutline"
                              @click="openNotes(item)"
                            />
                          </template>
                        </v-tooltip>
                        <v-btn size="small" class="saas-btn saas-btn-sm action-btn-primary" color="primary" variant="flat" prepend-icon="mdi-calendar-plus" @click="openFollowUp(item)">Schedule</v-btn>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="visibleSessions.length === 0">
                    <td colspan="7" class="text-center py-6">
                      <div class="text-h6 mb-1">No results found</div>
                      <div class="text-medium-emphasis">Adjust filters or search to view sessions.</div>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>

            <div class="d-md-none mobile-cards">
              <v-card v-for="item in visibleSessions" :key="`${item.caseId}-mobile`" class="mobile-session-card mb-3" variant="outlined">
                <v-card-text>
                  <div class="d-flex justify-space-between align-start mb-2">
                    <div>
                      <div class="font-weight-bold">{{ item.patientName }}</div>
                      <div class="text-caption text-medium-emphasis">{{ item.caseId }} | {{ item.patientId }}</div>
                    </div>
                    <v-chip size="small" :color="statusTone(item.status)" variant="tonal">{{ item.status }}</v-chip>
                  </div>
                  <div class="text-body-2 mb-2">{{ item.sessionType }} | {{ item.counselor }}</div>
                  <div class="text-caption text-medium-emphasis mb-2">Next follow-up: {{ item.nextFollowUp }}</div>
                  <div class="d-flex ga-2 flex-wrap">
                    <v-tooltip text="View Session" location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          size="small"
                          class="saas-btn action-icon-btn"
                          color="primary"
                          variant="tonal"
                          icon="$eye"
                          @click="openSessionDetails(item)"
                        />
                      </template>
                    </v-tooltip>
                    <v-tooltip text="Add Notes" location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          size="small"
                          class="saas-btn action-icon-btn action-btn-secondary"
                          color="secondary"
                          variant="outlined"
                          icon="$noteTextOutline"
                          @click="openNotes(item)"
                        />
                      </template>
                    </v-tooltip>
                    <v-btn size="small" class="saas-btn saas-btn-sm action-btn-primary" color="primary" variant="flat" prepend-icon="mdi-calendar-plus" @click="openFollowUp(item)">Schedule</v-btn>
                  </div>
                </v-card-text>
              </v-card>
              <v-alert v-if="visibleSessions.length === 0" color="info" variant="tonal">No results found.</v-alert>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" lg="4">
        <v-card class="surface-card mb-3" variant="outlined">
          <v-card-item><v-card-title>Upcoming Follow-Ups</v-card-title></v-card-item>
          <v-card-text class="side-panel-body">
            <div v-if="upcomingFollowUps.length === 0" class="empty-block">No upcoming follow-ups.</div>
            <div v-for="item in upcomingFollowUps" :key="item.caseId" class="mini-item">
              <div class="font-weight-bold">{{ item.patient }}</div>
              <div class="text-caption text-medium-emphasis">{{ item.caseId }} | {{ item.schedule }}</div>
            </div>
          </v-card-text>
        </v-card>

        <v-card class="surface-card mb-3" variant="outlined">
          <v-card-item><v-card-title>Recent Notes</v-card-title></v-card-item>
          <v-card-text class="side-panel-body">
            <div v-if="recentNotes.length === 0" class="empty-block">No recent notes.</div>
            <div v-for="(item, idx) in recentNotes" :key="`${item.patient}-${idx}`" class="timeline-item">
              <div class="timeline-dot" />
              <div>
                <div class="font-weight-bold">{{ item.patient }}</div>
                <div class="text-body-2 note-preview">{{ item.note }}</div>
                <div class="text-caption text-medium-emphasis">{{ item.author }} | {{ item.date }}</div>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <v-card class="surface-card" variant="outlined">
          <v-card-item><v-card-title>Risk Alerts</v-card-title></v-card-item>
          <v-card-text class="side-panel-body">
            <div v-if="riskAlerts.length === 0" class="empty-block">No risk alerts.</div>
            <div v-for="(item, idx) in riskAlerts" :key="`${item.patient}-${idx}`" class="mini-item risk-item">
              <div class="d-flex align-center justify-space-between">
                <div class="font-weight-bold">{{ item.patient }}</div>
                <v-chip size="x-small" color="error" variant="tonal">{{ item.level }}</v-chip>
              </div>
              <div class="text-caption text-medium-emphasis">{{ item.reason }}</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="surface-card mt-3" variant="outlined">
      <v-card-item><v-card-title>Activity Preview</v-card-title></v-card-item>
      <v-card-text>
        <div class="activity-grid">
          <div v-for="(activity, idx) in activityPreview" :key="`activity-${idx}`" class="activity-item">
            <div class="font-weight-bold">{{ activity.title }}</div>
            <div class="text-body-2">{{ activity.detail }}</div>
            <div class="text-caption text-medium-emphasis">{{ activity.time }}</div>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <v-dialog v-model="newSessionModal" max-width="760" transition="dialog-bottom-transition">
      <v-card>
        <v-card-item>
          <v-card-title>New Session</v-card-title>
          <template #append><v-btn icon="mdi-close" variant="text" @click="newSessionModal = false" /></template>
        </v-card-item>
        <v-divider />
        <v-card-text class="pt-5">
          <v-row>
            <v-col cols="12" md="6"><v-select v-model="newSessionForm.patient" :items="sessions.map((s) => s.patientName)" label="Patient" variant="outlined" /></v-col>
            <v-col cols="12" md="6"><v-select v-model="newSessionForm.sessionType" :items="sessionTypeItems.filter((s) => s !== 'All')" label="Session Type" variant="outlined" /></v-col>
            <v-col cols="12" md="6"><v-select v-model="newSessionForm.counselor" :items="counselorItems.filter((c) => c !== 'All')" label="Counselor" variant="outlined" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="newSessionForm.dateTime" label="Date & Time" type="datetime-local" variant="outlined" /></v-col>
            <v-col cols="12"><v-textarea v-model="newSessionForm.notes" label="Notes" variant="outlined" rows="3" /></v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn class="saas-btn saas-btn-ghost" @click="newSessionModal = false">Cancel</v-btn>
          <v-btn class="saas-btn saas-btn-primary" @click="createSessionPreview">Create Session</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="sessionDetailsModal" max-width="980" transition="dialog-bottom-transition">
      <v-card>
        <v-card-item>
          <v-card-title>Session Details</v-card-title>
          <template #append><v-btn icon="mdi-close" variant="text" @click="sessionDetailsModal = false" /></template>
        </v-card-item>
        <v-divider />
        <v-card-text class="pt-5">
          <v-tabs v-model="detailsTab" color="primary" density="comfortable">
            <v-tab value="overview">Overview</v-tab>
            <v-tab value="notes">Notes</v-tab>
            <v-tab value="follow_up">Follow-Up Plan</v-tab>
            <v-tab value="attachments">Attachments</v-tab>
          </v-tabs>
          <v-window v-model="detailsTab" class="mt-4">
            <v-window-item value="overview">
              <v-row v-if="selectedSession">
                <v-col cols="12" md="6">
                  <div class="summary-line"><span>Patient</span><strong>{{ selectedSession.patientName }}</strong></div>
                  <div class="summary-line"><span>Case ID</span><strong>{{ selectedSession.caseId }}</strong></div>
                  <div class="summary-line"><span>Counselor</span><strong>{{ selectedSession.counselor }}</strong></div>
                  <div class="summary-line"><span>Session Type</span><strong>{{ selectedSession.sessionType }}</strong></div>
                </v-col>
                <v-col cols="12" md="6">
                  <div class="summary-line"><span>Risk Status</span><v-chip size="small" :color="statusTone(selectedSession.status)" variant="tonal">{{ selectedSession.status }}</v-chip></div>
                  <div class="summary-line"><span>Last Session Date</span><strong>{{ selectedSession.lastSessionDate }}</strong></div>
                  <div class="summary-line"><span>Next Follow-Up</span><strong>{{ selectedSession.nextFollowUp }}</strong></div>
                </v-col>
              </v-row>
            </v-window-item>
            <v-window-item value="notes"><v-alert color="info" variant="tonal">Static note history placeholder for backend integration.</v-alert></v-window-item>
            <v-window-item value="follow_up"><v-alert color="primary" variant="tonal">Follow-up care plan placeholder section.</v-alert></v-window-item>
            <v-window-item value="attachments"><v-alert color="secondary" variant="tonal">Attachments placeholder (documents, referral files, assessments).</v-alert></v-window-item>
          </v-window>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="addNotesModal" max-width="680" transition="dialog-bottom-transition">
      <v-card>
        <v-card-item>
          <v-card-title>Add Notes</v-card-title>
          <template #append><v-btn icon="mdi-close" variant="text" @click="addNotesModal = false" /></template>
        </v-card-item>
        <v-divider />
        <v-card-text class="pt-5">
          <v-select v-model="noteForm.noteType" :items="['Progress', 'Risk', 'General']" label="Note Type" variant="outlined" class="mb-3" />
          <v-textarea v-model="noteForm.content" label="Notes" rows="4" variant="outlined" class="mb-2" />
          <v-checkbox v-model="noteForm.markAtRisk" label="Mark as At-Risk" color="error" hide-details />
        </v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn class="saas-btn saas-btn-ghost" @click="addNotesModal = false">Cancel</v-btn>
          <v-btn class="saas-btn saas-btn-primary" @click="saveNotePreview">Save Note</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="followUpModal" max-width="680" transition="dialog-bottom-transition">
      <v-card>
        <v-card-item>
          <v-card-title>Schedule Follow-Up</v-card-title>
          <template #append><v-btn icon="mdi-close" variant="text" @click="followUpModal = false" /></template>
        </v-card-item>
        <v-divider />
        <v-card-text class="pt-5">
          <v-text-field v-model="followUpForm.dateTime" label="Date & Time" type="datetime-local" variant="outlined" class="mb-3" />
          <v-checkbox v-model="followUpForm.reminder" label="Enable Reminder" color="primary" hide-details class="mb-3" />
          <v-textarea v-model="followUpForm.notes" label="Notes" rows="3" variant="outlined" />
        </v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn class="saas-btn saas-btn-ghost" @click="followUpModal = false">Cancel</v-btn>
          <v-btn class="saas-btn saas-btn-primary" @click="scheduleFollowUpPreview">Schedule</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="toast.open" :color="toast.color" :timeout="2500">{{ toast.text }}</v-snackbar>
  </div>
</template>

<style scoped>
.mental-health-page {
  background: radial-gradient(1100px 650px at 5% -8%, rgba(54, 92, 212, 0.14), transparent 62%),
    radial-gradient(920px 540px at 95% 3%, rgba(0, 180, 216, 0.1), transparent 60%);
}
.section-gap {
  margin-bottom: 16px;
}
.hero-card {
  border-radius: 16px;
  color: #fff;
  background: linear-gradient(120deg, #17308c 0%, #2f63cc 58%, #3b9ce8 100%);
  box-shadow: 0 12px 26px rgba(19, 45, 126, 0.2);
}
.hero-subtitle {
  color: rgba(255, 255, 255, 0.96);
  text-shadow: 0 1px 2px rgba(8, 20, 52, 0.35);
}
.quick-filter {
  min-width: 136px;
  max-width: 156px;
}
:deep(.hero-card .quick-filter .v-field) {
  background: rgba(255, 255, 255, 0.08);
}
:deep(.hero-card .quick-filter .v-label),
:deep(.hero-card .quick-filter .v-select__selection-text),
:deep(.hero-card .quick-filter .v-field__input),
:deep(.hero-card .quick-filter .v-icon) {
  color: rgba(255, 255, 255, 0.96) !important;
}
:deep(.hero-card .quick-filter .v-field__outline) {
  color: rgba(255, 255, 255, 0.55) !important;
}
.surface-card {
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #fafcff 100%);
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.kpi-card {
  border-radius: 12px;
  color: #fff;
  min-height: 96px;
  box-shadow: 0 12px 22px rgba(20, 47, 113, 0.18);
}
.kpi-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px !important;
}
.kpi-blue {
  background: linear-gradient(135deg, #365dd4 0%, #3777dc 100%);
}
.kpi-cyan {
  background: linear-gradient(135deg, #0a84b0 0%, #0caac4 100%);
}
.kpi-green {
  background: linear-gradient(135deg, #159977 0%, #21ba63 100%);
}
.kpi-amber {
  background: linear-gradient(135deg, #d2902b 0%, #ea9f18 100%);
}
.kpi-red {
  background: linear-gradient(135deg, #d35656 0%, #e44d4d 100%);
}
.kpi-title {
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.95;
  font-weight: 700;
  line-height: 1.1;
}
.kpi-value {
  margin-top: 4px;
  font-size: 38px;
  line-height: 1;
  font-weight: 900;
}
.filters-row :deep(.v-field) {
  min-height: 40px;
}
.tab-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-bottom: 1px solid rgba(91, 117, 178, 0.2);
  padding-bottom: 8px;
}
.tab-btn {
  border: 1px solid rgba(75, 109, 177, 0.22);
  background: #f7faff;
  color: #435b8f;
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 180ms ease;
}
.tab-btn:hover {
  background: #eff4ff;
}
.tab-btn.active {
  color: #1f4498;
  background: linear-gradient(120deg, rgba(50, 102, 210, 0.16) 0%, rgba(74, 172, 247, 0.16) 100%);
  border-color: rgba(61, 118, 221, 0.4);
}
.tab-badge {
  margin-left: 6px;
  border-radius: 999px;
  padding: 1px 7px;
  background: rgba(61, 118, 221, 0.12);
}
.session-table :deep(th) {
  padding: 10px 12px;
  font-size: 12px;
  letter-spacing: 0.35px;
}
.session-table :deep(td) {
  padding: 9px 12px;
  font-size: 13px;
}
.session-row {
  transition: background 150ms ease;
}
.session-row:hover {
  background: rgba(53, 115, 215, 0.08);
}
.case-id {
  font-size: 12px;
  font-weight: 700;
  color: #6376a3;
}
.status-chip {
  font-size: 11px;
  font-weight: 700;
}
.side-panel-body {
  padding: 10px 14px 12px !important;
}
.mini-item {
  padding: 8px 0;
  border-bottom: 1px solid rgba(86, 112, 168, 0.16);
}
.mini-item:last-child {
  border-bottom: 0;
}
.risk-item {
  border-left: 3px solid rgba(239, 68, 68, 0.45);
  padding-left: 10px;
}
.timeline-item {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.timeline-dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2f67d2 0%, #06b6d4 100%);
  box-shadow: 0 0 0 2px rgba(47, 103, 210, 0.12);
}
.note-preview {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.activity-grid {
  display: grid;
  gap: 10px;
}
.activity-item {
  border: 1px solid rgba(91, 117, 178, 0.2);
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(245, 249, 255, 0.8);
}
.empty-block {
  border: 1px dashed rgba(86, 112, 168, 0.32);
  border-radius: 10px;
  padding: 12px;
  text-align: center;
  color: #5971a3;
  font-size: 13px;
}
.summary-line {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}
.summary-line span {
  color: #5a72a1;
}
.mobile-session-card {
  border-radius: 12px;
}
.saas-btn {
  border-radius: 10px;
  min-height: 36px;
  text-transform: none;
  font-weight: 700;
  letter-spacing: 0.15px;
  transition: transform 170ms ease, box-shadow 170ms ease;
}
.saas-btn:hover {
  transform: translateY(-1px);
}
.saas-btn:deep(.v-btn__content) {
  gap: 5px;
}
.saas-btn-sm {
  min-height: 32px;
  font-size: 12px;
}
.saas-btn-primary {
  background: linear-gradient(120deg, #2a62d2 0%, #3e94ee 100%) !important;
  color: #fff !important;
  box-shadow: 0 7px 14px rgba(23, 50, 103, 0.18);
}
.saas-btn-light {
  background: #fff !important;
  color: #18356f !important;
  box-shadow: 0 7px 14px rgba(23, 50, 103, 0.14);
}
.saas-btn-ghost {
  background: #f5f8ff !important;
  color: #335792 !important;
  border: 1px solid rgba(52, 92, 168, 0.22) !important;
  box-shadow: none;
}
.action-icon-btn {
  width: 32px;
  height: 32px;
  min-width: 32px !important;
  border-radius: 50%;
}
.action-btn-secondary {
  min-height: 32px;
}
.action-btn-primary {
  min-height: 32px;
}
:deep(.v-overlay__scrim) {
  backdrop-filter: blur(3px);
}
@media (max-width: 1279px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 900px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}
:deep(.v-theme--dark) .surface-card,
:deep(.v-theme--dark) .activity-item,
:deep(.v-theme--dark) .mobile-session-card {
  background: linear-gradient(180deg, rgba(27, 41, 78, 0.94) 0%, rgba(20, 31, 59, 0.94) 100%);
  border-color: rgba(155, 184, 255, 0.2) !important;
}
:deep(.v-theme--dark) .tab-btn {
  background: rgba(255, 255, 255, 0.04);
  color: #c2d4ff;
  border-color: rgba(174, 201, 255, 0.24);
}
:deep(.v-theme--dark) .tab-btn.active {
  color: #fff;
}
</style>




