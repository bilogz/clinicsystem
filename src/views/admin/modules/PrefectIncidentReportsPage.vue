<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { fetchModuleActivity, type ModuleActivityItem } from '@/services/moduleActivity';
import { useRealtimeListSync } from '@/composables/useRealtimeListSync';
import { REALTIME_POLICY } from '@/config/realtimePolicy';
import { formatDateTimeWithTimezone } from '@/utils/dateTime';
import {
  rowToPrefectIncidentView,
  severityChipColor,
  type PrefectIncidentView
} from '@/utils/prefectIncidentDisplay';
import {
  fetchPrefectBridgeStatus,
  postPrefectIncidentAdminSimulate,
  postPrefectRegistrySync,
  type PrefectBridgeStatus
} from '@/services/prefectIntegration';
import { emitSuccessModal } from '@/composables/useSuccessModal';

const realtime = useRealtimeListSync();
const simulateLoading = ref(false);
const registrySyncLoading = ref(false);
const bridgeStatus = ref<PrefectBridgeStatus | null>(null);
const bridgeLoadError = ref('');
const loading = ref(true);
const listLoading = ref(false);
const error = ref('');
const search = ref('');
const page = ref(1);
const perPage = 12;
const total = ref(0);
const totalPages = ref(1);
const rawRows = ref<ModuleActivityItem[]>([]);

const detailOpen = ref(false);
const selected = ref<PrefectIncidentView | null>(null);
const detailTab = ref<'summary' | 'payload'>('summary');

const rows = computed(() => rawRows.value.map((r) => rowToPrefectIncidentView(r)));

const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter((r) => {
    const blob = [
      r.title,
      r.studentName,
      r.studentNo,
      r.referenceNo,
      r.detail,
      r.narrative,
      r.severity,
      r.location,
      r.status,
      r.correlationId
    ]
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  });
});

const originSample = computed(() => (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'));

function formatWhen(value: string): string {
  return formatDateTimeWithTimezone(value, { fallback: value || '--' });
}

function openDetail(row: PrefectIncidentView): void {
  selected.value = row;
  detailTab.value = 'summary';
  detailOpen.value = true;
}

function payloadJson(row: PrefectIncidentView): string {
  try {
    return JSON.stringify(row.raw.metadata ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

let searchDebounce: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  page.value = 1;
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchDebounce = null;
  }, 300);
});

async function loadList(options: { silent?: boolean } = {}): Promise<void> {
  if (!options.silent) listLoading.value = true;
  error.value = '';
  try {
    const data = await realtime.runLatest(
      async () =>
        fetchModuleActivity({
          module: 'prefect_incident',
          page: page.value,
          perPage,
          forceRefresh: true
        }),
      { silent: options.silent, onError: (e) => (error.value = e instanceof Error ? e.message : String(e)) }
    );
    if (!data) return;
    rawRows.value = data.items || [];
    total.value = data.meta?.total ?? 0;
    totalPages.value = data.meta?.totalPages ?? 1;
  } catch (e) {
    rawRows.value = [];
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    listLoading.value = false;
    loading.value = false;
  }
}

watch(page, () => {
  void loadList({ silent: true });
});

async function loadBridgeStatus(): Promise<void> {
  try {
    bridgeStatus.value = await fetchPrefectBridgeStatus();
    bridgeLoadError.value = '';
  } catch (e) {
    bridgeLoadError.value = e instanceof Error ? e.message : String(e);
  }
}

/** Saves one row without Prefect — proves DB + list; requires clinic admin cookie session. */
async function recordTestIncident(): Promise<void> {
  simulateLoading.value = true;
  error.value = '';
  try {
    await postPrefectIncidentAdminSimulate();
    await Promise.all([loadBridgeStatus(), loadList()]);
    emitSuccessModal({
      title: 'Test row saved',
      message:
        'A sample incident was written to module activity. Live data still arrives only when Prefect POSTs to this API with X-Integration-Token.',
      tone: 'success'
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    simulateLoading.value = false;
  }
}

/** Pull from clinic.department_clearance_records when HTTP bridge from Prefect failed but both use the same DB. */
async function syncFromRegistry(): Promise<void> {
  registrySyncLoading.value = true;
  error.value = '';
  try {
    const result = await postPrefectRegistrySync(50);
    await Promise.all([loadBridgeStatus(), loadList()]);
    const d = result.data;
    emitSuccessModal({
      title: 'Registry sync done',
      message: d
        ? `Inserted ${d.inserted} new row(s), skipped ${d.skipped} (already listed or empty ref), scanned ${d.scanned} clearance record(s).`
        : (result.message ?? 'Sync completed.'),
      tone: 'success'
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    registrySyncLoading.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadBridgeStatus(), loadList()]);
  realtime.startPolling(async () => {
    await loadList({ silent: true });
    await loadBridgeStatus();
  }, REALTIME_POLICY.polling.prefectIncidentsMs);
});

onUnmounted(() => {
  realtime.stopPolling();
  realtime.invalidatePending();
});
</script>

<template>
  <div class="prefect-incidents-page pa-4 pa-md-6">
    <div class="mb-6 d-flex flex-wrap justify-space-between align-start ga-4">
      <div>
        <h1 class="text-h4 font-weight-bold mb-2">Prefect incident reports</h1>
        <p class="text-body-1 text-medium-emphasis mb-0" style="max-width: 640px">
          Inbox = <code>module_activity_logs</code> (<code>prefect_incident</code>). Use the buttons for sync / test / refresh. Expand
          <strong>Integration help</strong> below if the list is empty.
        </p>
      </div>
      <div class="d-flex flex-wrap ga-2">
        <v-tooltip text="Copy rows from clinic.department_clearance_records when Prefect shares this database but HTTP POST failed" location="bottom">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              variant="tonal"
              color="secondary"
              prepend-icon="mdi-database-sync"
              :loading="registrySyncLoading"
              @click="syncFromRegistry"
            >
              Sync registry
            </v-btn>
          </template>
        </v-tooltip>
        <v-tooltip text="Insert one test row (requires signed-in clinic admin)" location="bottom">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              variant="outlined"
              color="primary"
              prepend-icon="mdi-flask-outline"
              :loading="simulateLoading"
              @click="recordTestIncident"
            >
              Test row
            </v-btn>
          </template>
        </v-tooltip>
        <v-btn class="saas-btn saas-btn-primary" prepend-icon="mdi-refresh" :loading="listLoading" @click="loadList()">
          Refresh
        </v-btn>
      </div>
    </div>

    <v-alert v-if="bridgeLoadError" type="error" variant="tonal" class="mb-4" border="start">
      Could not load bridge diagnostics: {{ bridgeLoadError }}
    </v-alert>

    <v-alert v-if="bridgeStatus?.tokenMissingOnClinic" type="error" variant="tonal" class="mb-4" border="start">
      <div class="font-weight-bold mb-1">Set the shared token on the clinic server</div>
      <p class="mb-0 text-body-2">
        Add <code>{{ bridgeStatus.sharedEnvKey }}</code> to <code>.env</code> and restart Vite. Prefect must send the same value as
        <code>X-Integration-Token</code> or POSTs return 401.
      </p>
    </v-alert>

    <v-card variant="outlined" class="help-card mb-6">
      <v-card-item class="pb-0">
        <v-card-title class="text-subtitle-1 px-0">Integration help</v-card-title>
        <v-card-subtitle class="px-0 text-wrap">
          This page only reads Postgres. Empty list = no rows yet — expand a section below if you need to fix Prefect → Clinic delivery.
        </v-card-subtitle>
      </v-card-item>
      <v-card-text class="pt-2">
        <v-expansion-panels variant="accordion" class="help-panels">
          <v-expansion-panel>
            <v-expansion-panel-title class="text-body-2 font-weight-medium">Database vs Prefect HTTP</v-expansion-panel-title>
            <v-expansion-panel-text class="text-body-2">
              <ul class="pl-4 mb-0 integration-list">
                <li>Refresh only re-queries <code>module_activity_logs</code> — zero rows is an empty table, not a failed “fetch” from Prefect.</li>
                <li>
                  Live rows are added when Prefect’s hub
                  <code>POST</code>s <code>{{ bridgeStatus?.ingestUrl || '/api/integrations/prefect/incident-reports' }}</code> with
                  <code>X-Integration-Token</code>, or when you click <strong>Test row</strong> (admin).
                </li>
                <li v-if="bridgeStatus?.dataSource" class="text-medium-emphasis">{{ bridgeStatus.dataSource }}</li>
                <li v-if="bridgeStatus?.explanation" class="text-medium-emphasis">{{ bridgeStatus.explanation }}</li>
              </ul>
            </v-expansion-panel-text>
          </v-expansion-panel>
          <v-expansion-panel>
            <v-expansion-panel-title class="text-body-2 font-weight-medium">Prefect on Netlify / remote</v-expansion-panel-title>
            <v-expansion-panel-text class="text-body-2">
              <p class="mb-2">{{ bridgeStatus?.remotePrefectNote || 'Remote Prefect cannot call http://localhost:5173. Use a public HTTPS URL for your clinic API, or run both locally.' }}</p>
              <ul class="pl-4 mb-0 integration-list">
                <li>Same secret: <code>DEPARTMENT_INTEGRATION_SHARED_TOKEN</code> (clinic) ↔ Prefect env + POST header.</li>
                <li>Prefect: <code>CLINIC_PREFECT_BRIDGE_URL</code> = full URL to the POST endpoint above.</li>
              </ul>
            </v-expansion-panel-text>
          </v-expansion-panel>
          <v-expansion-panel v-if="bridgeStatus?.registrySyncHint">
            <v-expansion-panel-title class="text-body-2 font-weight-medium">Same Supabase, inbox still empty</v-expansion-panel-title>
            <v-expansion-panel-text class="text-body-2">
              <p class="mb-0">{{ bridgeStatus.registrySyncHint }}</p>
              <p class="mt-2 mb-0 text-medium-emphasis">Use <strong>Sync registry</strong> to copy from <code>clinic.department_clearance_records</code>.</p>
            </v-expansion-panel-text>
          </v-expansion-panel>
          <v-expansion-panel v-if="bridgeStatus?.tokenConfigured">
            <v-expansion-panel-title class="text-body-2 font-weight-medium">Test POST with curl (Windows)</v-expansion-panel-title>
            <v-expansion-panel-text>
              <p class="text-body-2 mb-2">Replace <code>YOUR_TOKEN</code> with <code>DEPARTMENT_INTEGRATION_SHARED_TOKEN</code>:</p>
              <pre class="curl-pre">curl -X POST "{{ originSample }}/api/integrations/prefect/incident-reports" ^
  -H "Content-Type: application/json" ^
  -H "X-Integration-Token: YOUR_TOKEN" ^
  -d "{\"payload\":{\"title\":\"Test incident\",\"student_no\":\"2024-0001\",\"student_name\":\"Demo Student\",\"notes\":\"Dry run from curl\"}}"</pre>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
    </v-card>

    <v-card variant="outlined" class="surface-card mb-4">
      <v-card-text class="d-flex flex-wrap ga-3 align-center">
        <v-text-field
          v-model="search"
          density="comfortable"
          hide-details
          variant="outlined"
          prepend-inner-icon="mdi-magnify"
          label="Filter current page"
          style="max-width: 360px"
          clearable
        />
        <v-chip size="small" variant="tonal" color="primary">{{ total }} row(s) in module_activity_logs</v-chip>
      </v-card-text>
    </v-card>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

    <v-card variant="outlined" class="surface-card">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Stored incidents (database)</span>
        <v-progress-linear v-if="listLoading" indeterminate color="primary" style="max-width: 120px" />
      </v-card-title>
      <v-divider />
      <v-card-text>
        <template v-if="loading && !rawRows.length">
          <v-skeleton-loader type="table-heading, table-row-divider@6" />
        </template>
        <template v-else>
          <v-table density="comfortable" class="prefect-table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Incident</th>
                <th>Student / ID</th>
                <th>Severity</th>
                <th>Location</th>
                <th>Status</th>
                <th>Reference</th>
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredRows" :key="row.id">
                <td class="text-caption text-medium-emphasis">{{ formatWhen(row.created_at) }}</td>
                <td>
                  <div class="font-weight-bold">{{ row.title }}</div>
                  <div v-if="row.incidentType && row.incidentType !== row.title" class="text-caption text-medium-emphasis">
                    {{ row.incidentType }}
                  </div>
                </td>
                <td>
                  <div>{{ row.studentName || '—' }}</div>
                  <div class="text-caption text-medium-emphasis">{{ row.studentNo || '—' }}</div>
                </td>
                <td>
                  <v-chip v-if="row.severity" size="small" :color="severityChipColor(row.severity)" variant="tonal">
                    {{ row.severity }}
                  </v-chip>
                  <span v-else class="text-medium-emphasis">—</span>
                </td>
                <td>{{ row.location || '—' }}</td>
                <td>{{ row.status || '—' }}</td>
                <td class="text-caption">{{ row.referenceNo || row.entityKey || '—' }}</td>
                <td class="text-end">
                  <v-btn size="small" variant="tonal" color="primary" @click="openDetail(row)">View details</v-btn>
                </td>
              </tr>
              <tr v-if="!listLoading && !filteredRows.length">
                <td colspan="8" class="text-center text-medium-emphasis py-8">
                  {{ search.trim() ? 'No rows match your filter.' : 'No incident reports from Prefect yet.' }}
                </td>
              </tr>
            </tbody>
          </v-table>

          <div class="d-flex justify-end mt-4" v-if="totalPages > 1">
            <v-pagination v-model="page" :length="totalPages" total-visible="7" density="comfortable" />
          </div>
        </template>
      </v-card-text>
    </v-card>

    <v-dialog v-model="detailOpen" max-width="720" scrollable>
      <v-card v-if="selected">
        <v-card-title class="d-flex justify-space-between align-start">
          <div>
            <div class="text-overline text-medium-emphasis">Prefect → Clinic</div>
            <div class="text-h6">{{ selected.title }}</div>
            <div class="text-caption text-medium-emphasis mt-1">{{ formatWhen(selected.created_at) }}</div>
          </div>
          <v-btn icon variant="text" @click="detailOpen = false"><v-icon>mdi-close</v-icon></v-btn>
        </v-card-title>
        <v-divider />
        <v-tabs v-model="detailTab" density="comfortable" class="px-4 pt-2" color="primary">
          <v-tab value="summary">Summary</v-tab>
          <v-tab value="payload">Full payload</v-tab>
        </v-tabs>
        <v-window v-model="detailTab" class="px-0">
          <v-window-item value="summary">
            <v-card-text class="pt-4">
              <v-row dense>
                <v-col cols="12" sm="6"><div class="text-caption text-medium-emphasis">Student name</div>{{ selected.studentName || '—' }}</v-col>
                <v-col cols="12" sm="6"><div class="text-caption text-medium-emphasis">Student / patient ID</div>{{ selected.studentNo || '—' }}</v-col>
                <v-col cols="12" sm="6"><div class="text-caption text-medium-emphasis">Reference</div>{{ selected.referenceNo || '—' }}</v-col>
                <v-col cols="12" sm="6"><div class="text-caption text-medium-emphasis">Correlation</div>{{ selected.correlationId || '—' }}</v-col>
                <v-col cols="12" sm="6"><div class="text-caption text-medium-emphasis">Severity</div>{{ selected.severity || '—' }}</v-col>
                <v-col cols="12" sm="6"><div class="text-caption text-medium-emphasis">Location</div>{{ selected.location || '—' }}</v-col>
                <v-col cols="12" sm="6"><div class="text-caption text-medium-emphasis">Status</div>{{ selected.status || '—' }}</v-col>
                <v-col cols="12" sm="6"><div class="text-caption text-medium-emphasis">Date of incident</div>{{ selected.incidentDate || '—' }}</v-col>
                <v-col cols="12" sm="6"><div class="text-caption text-medium-emphasis">Reported by</div>{{ selected.reportedBy || '—' }}</v-col>
              </v-row>
              <v-divider class="my-4" />
              <div class="text-subtitle-2 mb-2">Narrative</div>
              <div class="text-body-2" style="white-space: pre-wrap">{{ selected.narrative || selected.detail || '—' }}</div>
            </v-card-text>
          </v-window-item>
          <v-window-item value="payload">
            <v-card-text class="pt-4">
              <pre class="payload-pre">{{ payloadJson(selected) }}</pre>
            </v-card-text>
          </v-window-item>
        </v-window>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="detailOpen = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.prefect-incidents-page code {
  background: rgba(78, 107, 168, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
}
.surface-card {
  border-radius: 16px;
  border-color: #dbe4f2 !important;
  background: #fbfdff;
}
.help-card {
  border-radius: 16px;
  border-color: #c5d4ec !important;
  background: #f8fafc;
}
.help-panels :deep(.v-expansion-panel-title) {
  min-height: 44px;
  padding-top: 8px;
  padding-bottom: 8px;
}
.integration-list li + li {
  margin-top: 6px;
}
.prefect-table th {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #48608d;
}
.payload-pre {
  font-size: 12px;
  line-height: 1.45;
  overflow: auto;
  max-height: 420px;
  padding: 12px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
}
.saas-btn {
  border-radius: 10px !important;
  text-transform: none !important;
  font-weight: 700 !important;
}
.saas-btn-primary {
  background: linear-gradient(135deg, #2f80ed 0%, #225ac8 100%) !important;
  color: #fff !important;
}
.curl-pre {
  font-size: 12px;
  line-height: 1.45;
  padding: 12px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
  overflow: auto;
  white-space: pre-wrap;
}
</style>
