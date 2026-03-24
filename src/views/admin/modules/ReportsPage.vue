<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import AnalyticsCardGrid from '@/components/shared/AnalyticsCardGrid.vue';
import SaasDateTimePickerField from '@/components/shared/SaasDateTimePickerField.vue';
import ModuleActivityLogs from '@/components/shared/ModuleActivityLogs.vue';
import ClinicHealthReportModal from '@/components/shared/ClinicHealthReportModal.vue';
import { useRealtimeListSync } from '@/composables/useRealtimeListSync';
import { useRealtimeClock } from '@/composables/useRealtimeClock';
import { formatDateTimeWithTimezone } from '@/utils/dateTime';
import {
  fetchReportsSnapshot,
  sendReportsToPmed,
  type ReportsActivityRow,
  type ReportsModuleTotal,
  type ReportsPmedRequestNotification,
  type ReportsPmedSection,
  type ReportsSnapshot,
  type ReportsTrendRow
} from '@/services/reports';
import { fetchHealthReports, type ClinicHealthReport } from '@/services/clinicHealthReports';
import { REALTIME_POLICY } from '@/config/realtimePolicy';
import { emitSuccessModal } from '@/composables/useSuccessModal';
import { fetchModuleActivity } from '@/services/moduleActivity';
import { rowToPrefectIncidentView, type PrefectIncidentView } from '@/utils/prefectIncidentDisplay';

const loading = ref(true);
const sendingToPmed = ref(false);
const fromDate = ref('');
const toDate = ref('');
const snapshot = ref<ReportsSnapshot | null>(null);
const moduleTotals = ref<ReportsModuleTotal[]>([]);
const trend = ref<ReportsTrendRow[]>([]);
const activity = ref<ReportsActivityRow[]>([]);
const pmedRequestNotifications = ref<ReportsPmedRequestNotification[]>([]);
const prefectPreview = ref<PrefectIncidentView[]>([]);
const prefectTotal = ref(0);
const toast = reactive({ open: false, text: '', color: 'info' as 'success' | 'info' | 'warning' | 'error' });
const realtime = useRealtimeListSync();
const { compactDateTimeText, dateText, timeText } = useRealtimeClock(1000);

// Health reports
const healthReportModalOpen = ref(false);
const healthReports = ref<ClinicHealthReport[]>([]);
const healthReportsTotal = ref(0);
const healthReportsLoading = ref(false);
const healthReportSearch = ref('');
const healthReportPage = ref(1);

let lastRequestId = 0;

const kpiCards = computed(() => {
  const base = snapshot.value?.kpis;
  return [
    { title: 'Total Patients', value: base?.totalPatients ?? 0, subtitle: 'Unified patient registry', className: 'analytics-card-blue', icon: 'mdi-account-group-outline' },
    { title: 'Total Visits', value: base?.totalVisits ?? 0, subtitle: 'Cross-module traffic', className: 'analytics-card-indigo', icon: 'mdi-chart-line' },
    { title: 'Pending Queue', value: base?.pendingQueue ?? 0, subtitle: 'Needs action', className: 'analytics-card-orange', icon: 'mdi-timer-sand' },
    { title: 'Emergency Cases', value: base?.emergencyCases ?? 0, subtitle: 'Escalated priority', className: 'analytics-card-red', icon: 'mdi-alert-octagon-outline' },
    { title: 'Active Profiles', value: base?.activeProfiles ?? 0, subtitle: 'With module activity', className: 'analytics-card-green', icon: 'mdi-account-check-outline' },
    { title: 'High Risk', value: base?.highRiskPatients ?? 0, subtitle: 'Clinical monitoring', className: 'analytics-card-purple', icon: 'mdi-heart-pulse' },
    { title: 'Dispensed Items', value: base?.dispensedItems ?? 0, subtitle: 'Pharmacy output', className: 'analytics-card-cyan', icon: 'mdi-pill' }
  ];
});

const pmedPackage = computed(() => snapshot.value?.pmedPackage ?? null);
const hasPmedRequests = computed(() => pmedRequestNotifications.value.length > 0);
const snapshotGeneratedText = computed(() => {
  if (!snapshot.value?.generatedAt) return 'Waiting for report snapshot';
  return formatDate(snapshot.value.generatedAt);
});

function showToast(text: string, color: 'success' | 'info' | 'warning' | 'error' = 'info'): void {
  if (color === 'success') {
    emitSuccessModal({ title: 'Success', message: text, tone: 'success' });
    return;
  }
  toast.text = text;
  toast.color = color;
  toast.open = true;
}

function formatDate(value: string): string {
  return formatDateTimeWithTimezone(value);
}

function totalTrendRow(row: ReportsTrendRow): number {
  return row.appointments + row.walkin + row.checkup + row.mental + row.pharmacy;
}

function sourceLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sectionMetricPreview(section: ReportsPmedSection): string {
  return section.metrics
    .slice(0, 3)
    .map((metric) => `${metric.label}: ${metric.total}`)
    .join(' • ');
}

async function load(options: { silent?: boolean; forceRefresh?: boolean } = {}): Promise<void> {
  const requestId = ++lastRequestId;
  if (!options.silent) loading.value = true;
  try {
    const [data, prefectPayload] = await Promise.all([
      fetchReportsSnapshot({
        from: fromDate.value || undefined,
        to: toDate.value || undefined,
        forceRefresh: options.forceRefresh ?? options.silent ?? false
      }),
      fetchModuleActivity({
        module: 'prefect_incident',
        page: 1,
        perPage: 5,
        forceRefresh: Boolean(options.forceRefresh) || !options.silent
      }).catch(() => ({
        items: [],
        meta: { page: 1, perPage: 5, total: 0, totalPages: 1 }
      }))
    ]);
    if (requestId !== lastRequestId) return;
    snapshot.value = data;
    moduleTotals.value = data.moduleTotals;
    trend.value = data.dailyTrend;
    activity.value = data.recentActivity;
    pmedRequestNotifications.value = data.pmedRequestNotifications || [];
    if (!fromDate.value) fromDate.value = data.window.from;
    if (!toDate.value) toDate.value = data.window.to;
    prefectPreview.value = (prefectPayload.items || []).map((row) => rowToPrefectIncidentView(row));
    prefectTotal.value = Number(prefectPayload.meta?.total ?? prefectPreview.value.length);
  } catch (error) {
    if (!options.silent) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    }
  } finally {
    if (requestId === lastRequestId && !options.silent) loading.value = false;
  }
}

async function sendToPmed(): Promise<void> {
  sendingToPmed.value = true;
  try {
    await sendReportsToPmed({ actor: 'Reports Admin' });
    showToast('PMED-required reports sent successfully.', 'success');
    await load({ silent: true });
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    sendingToPmed.value = false;
  }
}

async function loadHealthReports(options: { silent?: boolean } = {}): Promise<void> {
  if (!options.silent) healthReportsLoading.value = true;
  try {
    const result = await fetchHealthReports({
      search: healthReportSearch.value || undefined,
      page: healthReportPage.value,
      perPage: 10,
      forceRefresh: true
    });
    healthReports.value = result?.items ?? [];
    healthReportsTotal.value = result?.meta?.total ?? 0;
  } catch {
    // Silently fail — table may not exist on older deployments
    healthReports.value = [];
  } finally {
    if (!options.silent) healthReportsLoading.value = false;
  }
}

function onHealthReportSubmitted(code: string): void {
  showToast(`Health report ${code} sent to PMED successfully.`, 'success');
  void loadHealthReports();
}

function severityColor(value: string): string {
  if (value === 'emergency' || value === 'high') return 'error';
  if (value === 'moderate') return 'warning';
  return 'success';
}

function severityIcon(value: string): string {
  if (value === 'emergency') return 'mdi-ambulance';
  if (value === 'high') return 'mdi-alert-outline';
  if (value === 'moderate') return 'mdi-alert-circle-outline';
  return 'mdi-check-circle-outline';
}

onMounted(async () => {
  await load({ forceRefresh: true });
  void loadHealthReports();
  realtime.startPolling(() => {
    void load({ silent: true, forceRefresh: true });
  }, REALTIME_POLICY.polling.reportsMs);
});

onUnmounted(() => {
  realtime.stopPolling();
  realtime.invalidatePending();
});
</script>

<template>
  <div class="reports-page">
    <template v-if="loading && !snapshot">
      <v-card class="hero-card" variant="outlined">
        <v-card-text>
          <v-skeleton-loader type="heading, text" />
        </v-card-text>
      </v-card>

      <v-row>
        <v-col v-for="index in 6" :key="`reports-skeleton-card-${index}`" cols="12" sm="6" lg="4">
          <v-skeleton-loader type="image, article" class="rounded-lg" />
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12" md="4">
          <v-card class="surface-card" variant="outlined">
            <v-card-text>
              <v-skeleton-loader type="heading, list-item-three-line@5" />
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="8">
          <v-card class="surface-card" variant="outlined">
            <v-card-text>
              <v-skeleton-loader type="heading, list-item-two-line@6" />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-card class="surface-card" variant="outlined">
        <v-card-text>
          <v-skeleton-loader type="heading, actions, table-heading, table-row-divider@6" />
        </v-card-text>
      </v-card>
    </template>

    <template v-else>
      <v-card class="hero-card" variant="outlined">
        <v-card-text class="d-flex justify-space-between align-center flex-wrap ga-3">
          <div>
            <div class="hero-kicker">Reporting Hub</div>
            <h1 class="text-h4 font-weight-black mb-1">Clinic Reports</h1>
            <p class="hero-subtitle mb-0">Dynamic, Supabase-backed analytics across appointments, walk-in, check-up, mental health, and pharmacy.</p>
          </div>
          <div class="d-flex ga-2 flex-wrap justify-end">
            <v-chip class="hero-chip" color="primary" variant="flat">
              Live now: {{ compactDateTimeText }}
            </v-chip>
            <v-chip class="hero-chip" color="info" variant="flat">
              Snapshot: {{ snapshotGeneratedText }}
            </v-chip>
          </div>
        </v-card-text>
      </v-card>

      <AnalyticsCardGrid :items="kpiCards" md="4" lg="3" />

      <v-alert
        v-if="hasPmedRequests"
        type="info"
        variant="tonal"
        border="start"
        class="surface-card"
      >
        <div class="font-weight-bold mb-2">PMED Report Requests</div>
        <div class="text-body-2 mb-3">PMED has requested report submissions from the clinic reporting desk.</div>
        <v-list class="transparent pa-0" density="compact">
          <v-list-item
            v-for="row in pmedRequestNotifications"
            :key="`${row.entity_key}-${row.created_at}`"
            class="px-0"
          >
            <template #title>{{ row.detail }}</template>
            <template #subtitle>
              {{ row.metadata.report_name || row.action }}
            </template>
            <template #append>
              <div class="text-right">
                <div class="text-caption">{{ row.actor }}</div>
                <div class="text-caption text-medium-emphasis">{{ formatDate(row.created_at) }}</div>
              </div>
            </template>
          </v-list-item>
        </v-list>
      </v-alert>

      <v-card class="surface-card prefect-preview-card" variant="outlined">
        <v-card-item>
          <div class="d-flex flex-wrap justify-space-between align-center ga-2">
            <div>
              <div class="text-overline font-weight-bold text-primary">Prefect integration</div>
              <v-card-title class="px-0 pt-1">Prefect incidents (from database)</v-card-title>
              <div class="text-medium-emphasis text-body-2">
                Preview rows read only from <code>module_activity_logs</code> (same source as Integration → Prefect incident reports). Nothing is
                loaded from Prefect servers in the browser.
              </div>
            </div>
            <div class="d-flex ga-2 align-center flex-wrap">
              <v-chip v-if="prefectTotal" color="warning" variant="tonal" size="small">
                {{ prefectTotal }} total
              </v-chip>
              <router-link class="text-primary font-weight-bold text-decoration-none" to="/modules/prefect-incidents">
                Open inbox →
              </router-link>
            </div>
          </div>
        </v-card-item>
        <v-divider />
        <v-card-text class="pt-4">
          <v-list v-if="prefectPreview.length" class="transparent pa-0" density="compact">
            <v-list-item v-for="row in prefectPreview" :key="row.id" class="px-0">
              <template #title>{{ row.title }}</template>
              <template #subtitle>
                <span v-if="row.studentName || row.studentNo">{{ [row.studentName, row.studentNo].filter(Boolean).join(' · ') }}</span>
                <span v-else class="text-medium-emphasis">No student ID on record</span>
                <span v-if="row.severity" class="ml-2">· {{ row.severity }}</span>
              </template>
              <template #append>
                <div class="text-right text-caption text-medium-emphasis">{{ formatDate(row.created_at) }}</div>
              </template>
            </v-list-item>
          </v-list>
          <div v-else class="text-body-2 text-medium-emphasis">
            No matching rows in the database yet. When incidents are written to <code>module_activity_logs</code> (via Prefect POST or admin
            test), they appear here and in the full inbox.
          </div>
        </v-card-text>
      </v-card>

      <v-card class="surface-card pmed-flow-card" variant="outlined">
        <v-card-item>
          <div>
            <div class="text-overline font-weight-bold text-primary">PMED Flow</div>
            <v-card-title class="px-0">Send Required Reports To PMED</v-card-title>
            <div class="text-medium-emphasis">
              Packages only the sections PMED needs: enrollment, finance, health services, counseling, discipline, laboratory, program activity, and HR performance.
            </div>
          </div>
          <template #append>
            <div class="d-flex ga-2 align-center flex-wrap justify-end">
              <v-chip color="primary" variant="tonal">
                {{ pmedPackage?.summary.section_count ?? 0 }} sections
              </v-chip>
              <v-chip color="info" variant="tonal">
                {{ pmedPackage?.summary.source_count ?? 0 }} source modules
              </v-chip>
              <v-chip v-if="hasPmedRequests" color="warning" variant="tonal">
                {{ pmedRequestNotifications.length }} PMED request{{ pmedRequestNotifications.length > 1 ? 's' : '' }}
              </v-chip>
              <v-chip color="secondary" variant="tonal">
                {{ dateText }} | {{ timeText }}
              </v-chip>
              <v-btn
                class="saas-btn saas-btn-primary"
                prepend-icon="mdi-send"
                :loading="sendingToPmed"
                @click="sendToPmed"
              >
                Send To PMED
              </v-btn>
            </div>
          </template>
        </v-card-item>
        <v-divider />
        <v-card-text class="pt-4">
          <v-row>
            <v-col cols="12" md="7">
              <div class="text-subtitle-1 font-weight-bold mb-3">PMED Required Sections</div>
              <div class="d-flex flex-column ga-3">
                <v-sheet
                  v-for="section in pmedPackage?.sections || []"
                  :key="section.key"
                  class="pmed-section-card"
                  border
                  rounded="lg"
                >
                  <div class="d-flex justify-space-between align-start ga-3 flex-wrap">
                    <div>
                      <div class="font-weight-bold">{{ section.title }}</div>
                      <div class="text-body-2 text-medium-emphasis">{{ sectionMetricPreview(section) || 'No metrics available.' }}</div>
                    </div>
                    <v-chip size="small" color="primary" variant="tonal">{{ sourceLabel(section.source) }}</v-chip>
                  </div>
                </v-sheet>
              </div>
            </v-col>
            <v-col cols="12" md="5">
              <div class="text-subtitle-1 font-weight-bold mb-3">Recent PMED Deliveries</div>
              <v-list class="transparent pa-0" density="compact">
                <v-list-item
                  v-for="row in pmedPackage?.recent_deliveries || []"
                  :key="`${row.entity_key}-${row.created_at}`"
                  class="px-0"
                >
                  <template #title>{{ row.action }}</template>
                  <template #subtitle>{{ row.detail }}</template>
                  <template #append>
                    <div class="text-right">
                      <div class="text-caption">{{ row.actor }}</div>
                      <div class="text-caption text-medium-emphasis">{{ formatDate(row.created_at) }}</div>
                    </div>
                  </template>
                </v-list-item>
                <v-list-item v-if="!(pmedPackage?.recent_deliveries?.length)">
                  <template #title>No PMED report deliveries yet.</template>
                </v-list-item>
              </v-list>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- ── Clinic Health Reports Section ─────────────────────────────────── -->
      <v-card class="surface-card health-reports-card" variant="outlined">
        <v-card-item>
          <div class="d-flex flex-wrap justify-space-between align-center ga-2">
            <div>
              <div class="text-overline font-weight-bold" style="color:#c62828;">Health Reports → PMED</div>
              <v-card-title class="px-0 pt-1">Student / Patient Health Issue Reports</v-card-title>
              <div class="text-medium-emphasis text-body-2">
                Document a student's health issue, medicines and first aid used, then send the report directly to PMED for monitoring.
              </div>
            </div>
            <div class="d-flex ga-2 align-center flex-wrap">
              <v-chip v-if="healthReportsTotal > 0" color="error" variant="tonal" size="small">
                {{ healthReportsTotal }} report{{ healthReportsTotal !== 1 ? 's' : '' }}
              </v-chip>
              <v-btn
                color="error"
                variant="flat"
                rounded="lg"
                prepend-icon="mdi-medical-bag"
                class="saas-btn"
                @click="healthReportModalOpen = true"
              >
                New Health Report
              </v-btn>
            </div>
          </div>
        </v-card-item>
        <v-divider />
        <v-card-text class="pt-3">
          <!-- Search bar -->
          <div class="d-flex ga-2 align-center mb-4 flex-wrap">
            <v-text-field
              v-model="healthReportSearch"
              placeholder="Search by student name, ID or health issue…"
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-magnify"
              hide-details
              clearable
              style="max-width: 420px;"
              @update:model-value="healthReportPage = 1; loadHealthReports()"
            />
            <v-btn
              icon
              size="small"
              variant="text"
              :loading="healthReportsLoading"
              @click="loadHealthReports()"
            >
              <v-icon>mdi-refresh</v-icon>
            </v-btn>
          </div>

          <v-progress-linear v-if="healthReportsLoading" color="error" indeterminate class="mb-3" rounded />

          <!-- Reports table -->
          <v-table v-if="healthReports.length" density="comfortable" hover>
            <thead>
              <tr>
                <th style="width:130px;">CODE</th>
                <th>PATIENT</th>
                <th>HEALTH ISSUE</th>
                <th style="width:110px;">SEVERITY</th>
                <th>MEDICINE / FIRST AID</th>
                <th style="width:80px;">PMED</th>
                <th style="width:140px;">DATE</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in healthReports" :key="r.reportCode">
                <td>
                  <code class="text-caption">{{ r.reportCode }}</code>
                </td>
                <td>
                  <div class="font-weight-bold">{{ r.studentName }}</div>
                  <div class="text-caption text-medium-emphasis">
                    {{ [r.studentId, r.gradeSection].filter(Boolean).join(' · ') || r.studentType }}
                  </div>
                </td>
                <td>
                  <div class="text-body-2" style="max-width:260px; white-space:pre-wrap;">{{ r.healthIssue }}</div>
                  <div v-if="r.symptoms" class="text-caption text-medium-emphasis" style="max-width:260px;">{{ r.symptoms }}</div>
                </td>
                <td>
                  <v-chip
                    :color="severityColor(r.severity)"
                    :prepend-icon="severityIcon(r.severity)"
                    size="small"
                    variant="flat"
                    class="text-capitalize"
                  >{{ r.severity }}</v-chip>
                </td>
                <td>
                  <div v-if="r.medicinesUsed?.length" class="text-body-2">
                    <span v-for="(m, idx) in r.medicinesUsed.slice(0,3)" :key="idx">
                      <v-chip size="x-small" color="indigo" variant="tonal" class="mr-1 mb-1">{{ m.name }}</v-chip>
                    </span>
                    <span v-if="r.medicinesUsed.length > 3" class="text-caption text-medium-emphasis">+{{ r.medicinesUsed.length - 3 }} more</span>
                  </div>
                  <div v-if="r.firstAidGiven" class="text-caption text-medium-emphasis mt-1">
                    <v-icon size="12" class="mr-1">mdi-bandage</v-icon>{{ r.firstAidGiven.slice(0, 60) }}{{ r.firstAidGiven.length > 60 ? '…' : '' }}
                  </div>
                  <div v-if="!r.medicinesUsed?.length && !r.firstAidGiven" class="text-caption text-medium-emphasis">—</div>
                </td>
                <td>
                  <v-chip
                    :color="r.sentToPmed ? 'success' : 'warning'"
                    :prepend-icon="r.sentToPmed ? 'mdi-check-circle' : 'mdi-clock-outline'"
                    size="small"
                    variant="tonal"
                  >{{ r.sentToPmed ? 'Sent' : 'Pending' }}</v-chip>
                </td>
                <td>
                  <div class="text-caption">{{ r.createdAt }}</div>
                  <div v-if="r.attendingStaff" class="text-caption text-medium-emphasis">{{ r.attendingStaff }}</div>
                </td>
              </tr>
            </tbody>
          </v-table>

          <div v-else-if="!healthReportsLoading" class="health-empty-state">
            <v-icon size="48" color="error" opacity="0.4">mdi-medical-bag</v-icon>
            <div class="text-h6 mt-2">No health reports yet</div>
            <div class="text-body-2 text-medium-emphasis mb-4">
              When a student visits the clinic, create a health report to document the issue and send it to PMED.
            </div>
            <v-btn color="error" variant="flat" rounded="lg" prepend-icon="mdi-plus" @click="healthReportModalOpen = true">
              Create First Report
            </v-btn>
          </div>

          <!-- Pagination -->
          <div v-if="healthReportsTotal > 10" class="d-flex justify-center mt-4">
            <v-pagination
              v-model="healthReportPage"
              :length="Math.ceil(healthReportsTotal / 10)"
              density="compact"
              @update:model-value="loadHealthReports()"
            />
          </div>
        </v-card-text>
      </v-card>
      <!-- ── End Health Reports Section ──────────────────────────────────── -->

      <v-row>
        <v-col cols="12" md="4">
          <v-card class="surface-card" variant="outlined">
            <v-card-title>Module Distribution</v-card-title>
            <v-divider />
            <v-list density="comfortable">
              <v-list-item v-for="row in moduleTotals" :key="row.module">
                <template #title>{{ row.module }}</template>
                <template #append><strong>{{ row.total }}</strong></template>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>
        <v-col cols="12" md="8">
          <v-card class="surface-card" variant="outlined">
            <v-card-title>Recent Activity</v-card-title>
            <v-divider />
            <v-list density="compact">
              <v-list-item v-for="row in activity" :key="`${row.module}-${row.action}-${row.created_at}`">
                <template #title>{{ row.action }}</template>
                <template #subtitle>{{ row.detail }}</template>
                <template #append>
                  <div class="text-right">
                    <div class="text-caption">{{ row.module }}</div>
                    <div class="text-caption text-medium-emphasis">{{ formatDate(row.created_at) }}</div>
                  </div>
                </template>
              </v-list-item>
              <v-list-item v-if="!activity.length">
                <template #title>No activity logs available.</template>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>
      </v-row>

      <v-card class="surface-card" variant="outlined">
        <v-card-item>
          <v-card-title>Daily Trend</v-card-title>
          <template #append>
            <div class="d-flex ga-2 align-center flex-wrap">
              <SaasDateTimePickerField v-model="fromDate" mode="date" label="From" hide-details />
              <SaasDateTimePickerField v-model="toDate" mode="date" label="To" hide-details />
              <v-btn class="saas-btn saas-btn-primary" prepend-icon="mdi-chart-line" :loading="loading" @click="load">Apply</v-btn>
            </div>
          </template>
        </v-card-item>
        <v-divider />
        <v-card-text class="pt-2">
          <v-progress-linear v-if="loading" color="primary" indeterminate class="mb-2" />
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>DATE</th>
                <th>APPOINTMENTS</th>
                <th>WALK-IN</th>
                <th>CHECK-UP</th>
                <th>MENTAL</th>
                <th>PHARMACY</th>
                <th>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in trend" :key="row.day">
                <td>{{ row.day }}</td>
                <td>{{ row.appointments }}</td>
                <td>{{ row.walkin }}</td>
                <td>{{ row.checkup }}</td>
                <td>{{ row.mental }}</td>
                <td>{{ row.pharmacy }}</td>
                <td class="font-weight-bold">{{ totalTrendRow(row) }}</td>
              </tr>
              <tr v-if="!loading && !trend.length">
                <td colspan="7" class="text-center text-medium-emphasis py-6">No report data available for selected dates.</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </template>

    <ModuleActivityLogs module="all" title="All Module Activity Logs" :per-page="12" />

    <v-snackbar v-model="toast.open" :color="toast.color" timeout="2800">{{ toast.text }}</v-snackbar>

    <ClinicHealthReportModal
      v-model="healthReportModalOpen"
      @submitted="onHealthReportSubmitted"
    />
  </div>
</template>

<style scoped>
.reports-page { display: grid; gap: 16px; }
.hero-card {
  border-radius: 18px;
  border-color: rgba(18, 65, 112, 0.16) !important;
  color: #ffffff;
  background: linear-gradient(125deg, #124170 0%, #156ba6 55%, #2aa18a 100%);
  box-shadow: 0 16px 30px rgba(14, 45, 84, 0.24);
}
.hero-kicker {
  display: inline-flex;
  margin-bottom: 10px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.34);
  background: rgba(255, 255, 255, 0.14);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.55px;
  text-transform: uppercase;
}
.hero-subtitle {
  max-width: 700px;
  color: rgba(255, 255, 255, 0.92);
}
.hero-chip {
  color: #ffffff !important;
  background: rgba(255, 255, 255, 0.16) !important;
  border: 1px solid rgba(255, 255, 255, 0.24) !important;
  backdrop-filter: blur(8px);
}
.surface-card { border-radius: 16px; border-color: #dbe4f2 !important; background: #fbfdff; }
.prefect-preview-card { border-color: #ffe0b2 !important; background: linear-gradient(135deg, #fffaf3 0%, #fff7ed 100%); }
.pmed-flow-card { border-color: #cfe0ff !important; background: linear-gradient(135deg, #f7fbff 0%, #f2f7ff 100%); }
.pmed-section-card { padding: 14px 16px; background: rgba(255, 255, 255, 0.82); border-color: #d7e4ff !important; }
.metric-card { border-radius: 12px; color: #fff; min-height: 122px; box-shadow: 0 10px 18px rgba(16, 24, 40, 0.18); }
.metric-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; }
.metric-value { font-size: 30px; font-weight: 800; line-height: 1.1; margin-top: 2px; }
.metric-subtitle { opacity: 0.9; font-size: 13px; margin-top: 6px; }
.metric-blue { background: linear-gradient(135deg, #2f80ed 0%, #0f5ec2 100%); }
.metric-indigo { background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); }
.metric-amber { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
.metric-red { background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); }
.metric-green { background: linear-gradient(135deg, #22c55e 0%, #15803d 100%); }
.metric-orange { background: linear-gradient(135deg, #fb923c 0%, #ea580c 100%); }
.metric-cyan { background: linear-gradient(135deg, #06b6d4 0%, #0e7490 100%); }
.saas-btn { border-radius: 10px !important; text-transform: none !important; font-weight: 700 !important; min-height: 36px !important; }
.saas-btn-primary { background: linear-gradient(135deg, #2f80ed 0%, #225ac8 100%) !important; color: #fff !important; }
.health-reports-card { border-color: #ffcdd2 !important; background: linear-gradient(135deg, #fff5f5 0%, #fff8f8 100%); }
.health-empty-state { text-align: center; padding: 40px 20px; }
</style>
