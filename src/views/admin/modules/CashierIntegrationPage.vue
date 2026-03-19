<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import AnalyticsCardGrid from '@/components/shared/AnalyticsCardGrid.vue';
import ModuleActivityLogs from '@/components/shared/ModuleActivityLogs.vue';
import { useRealtimeListSync } from '@/composables/useRealtimeListSync';
import { emitSuccessModal } from '@/composables/useSuccessModal';
import { REALTIME_POLICY } from '@/config/realtimePolicy';
import {
  fetchCashierDepartmentRecords,
  fetchCashierIntegrationStatus,
  fetchCashierQueue,
  type CashierDepartmentRecord,
  type CashierIntegrationQueueItem,
  type CashierIntegrationStatus
} from '@/services/cashierIntegration';

type QueueSyncFilter = 'all' | 'pending' | 'sent' | 'acknowledged' | 'failed';
type ClearanceStatusFilter = 'all' | 'pending' | 'approved' | 'hold' | 'rejected';

const loading = ref(true);
const pageReady = ref(false);
const refreshing = ref(false);
const queuePage = ref(1);
const clearancePage = ref(1);
const queueSyncFilter = ref<QueueSyncFilter>('all');
const clearanceStatusFilter = ref<ClearanceStatusFilter>('all');
const clearanceSearch = ref('');
const activeTab = ref<'queue' | 'clearance' | 'payments'>('queue');

const status = ref<CashierIntegrationStatus | null>(null);
const queueItems = ref<CashierIntegrationQueueItem[]>([]);
const queueMeta = reactive({ page: 1, perPage: 10, total: 0, totalPages: 1 });
const clearanceItems = ref<CashierDepartmentRecord[]>([]);
const clearanceMeta = reactive({ page: 1, perPage: 10, total: 0, totalPages: 1 });
const toast = reactive({ open: false, text: '', color: 'info' as 'success' | 'info' | 'warning' | 'error' });

const realtime = useRealtimeListSync();

const queueFilterItems = [
  { label: 'All queue', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Sent', value: 'sent' },
  { label: 'Acknowledged', value: 'acknowledged' },
  { label: 'Failed', value: 'failed' }
] as const;

const clearanceFilterItems = [
  { label: 'All clearances', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'On hold', value: 'hold' },
  { label: 'Rejected', value: 'rejected' }
] as const;

const summaryCards = computed(() => {
  const currentStatus = status.value;
  const pendingClearances = clearanceItems.value.filter((item) => item.status === 'pending').length;
  const approvedClearances = clearanceItems.value.filter((item) => item.status === 'approved').length;
  const outstandingPayments = (currentStatus?.recentPayments || []).filter((item) => item.balance_due > 0).length;

  return [
    {
      title: 'Pending Sync',
      value: currentStatus?.queue.pending ?? 0,
      subtitle: 'Cashier events waiting to dispatch',
      className: 'analytics-card-blue',
      icon: 'mdi-tray-arrow-up'
    },
    {
      title: 'Pending Clearance',
      value: pendingClearances,
      subtitle: 'Cashier approvals still blocked',
      className: 'analytics-card-orange',
      icon: 'mdi-file-clock-outline'
    },
    {
      title: 'Outstanding Payments',
      value: outstandingPayments,
      subtitle: 'Records with remaining balance',
      className: 'analytics-card-red',
      icon: 'mdi-cash-remove'
    },
    {
      title: 'Approved View',
      value: approvedClearances,
      subtitle: 'Cashier-cleared department items',
      className: 'analytics-card-green',
      icon: 'mdi-check-decagram-outline'
    }
  ];
});

const isInternalSupabaseSync = computed(() => status.value?.baseUrl === 'supabase://internal');

const syncModeLabel = computed(() => {
  if (!status.value?.enabled) return 'Manual queue mode';
  if (isInternalSupabaseSync.value) return 'Supabase live sync';
  return 'Live endpoint enabled';
});

const queueStatusText = computed(() => {
  if (!status.value) return 'Loading cashier integration status...';
  if (!status.value.enabled) return 'Read-only queue monitoring is active. Billing events, payment status, and cashier clearance data stay visible here while financial updates remain restricted to the cashier-side flow.';
  if (isInternalSupabaseSync.value) return 'Cashier sync is live through the shared Supabase workflow. This page is now a read-only monitor for clinic, cashier, patient sync, and department clearance billing state.';
  return `Cashier sync is live in ${status.value.syncMode} mode. This page remains read-only while external cashier handling continues through the integration flow.`;
});

const recentPaymentHighlights = computed(() => (status.value?.recentPayments || []).slice(0, 4));

function showToast(text: string, color: 'success' | 'info' | 'warning' | 'error' = 'info'): void {
  if (color === 'success') {
    emitSuccessModal({ title: 'Success', message: text, tone: 'success' });
    return;
  }
  toast.text = text;
  toast.color = color;
  toast.open = true;
}

function formatMoney(value: number, currency = 'PHP'): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function syncStatusColor(value: string): string {
  if (value === 'acknowledged') return 'success';
  if (value === 'sent') return 'info';
  if (value === 'failed') return 'error';
  return 'warning';
}

function paymentStatusColor(value: string): string {
  if (value === 'paid') return 'success';
  if (value === 'partial') return 'warning';
  if (value === 'void' || value === 'refunded') return 'info';
  return 'error';
}

function clearanceStatusColor(value: string): string {
  if (value === 'approved') return 'success';
  if (value === 'hold') return 'warning';
  if (value === 'rejected') return 'error';
  return 'info';
}

function queueFiltersPayload(): { syncStatus?: string; page: number; perPage: number } {
  return {
    page: queuePage.value,
    perPage: queueMeta.perPage,
    syncStatus: queueSyncFilter.value === 'all' ? undefined : queueSyncFilter.value
  };
}

function clearanceFiltersPayload(): { status?: string; search?: string; page: number; perPage: number } {
  return {
    page: clearancePage.value,
    perPage: clearanceMeta.perPage,
    status: clearanceStatusFilter.value === 'all' ? undefined : clearanceStatusFilter.value,
    search: clearanceSearch.value.trim() || undefined
  };
}

async function loadDashboard(options: { silent?: boolean } = {}): Promise<void> {
  const data = await realtime.runLatest(
    async () => {
      const [statusResult, queueResult, departmentResult] = await Promise.all([
        fetchCashierIntegrationStatus(),
        fetchCashierQueue(queueFiltersPayload()),
        fetchCashierDepartmentRecords(clearanceFiltersPayload())
      ]);

      return { statusResult, queueResult, departmentResult };
    },
    {
      silent: options.silent,
      onStart: () => {
        if (options.silent) {
          refreshing.value = true;
        } else {
          loading.value = true;
        }
      },
      onFinish: () => {
        loading.value = false;
        refreshing.value = false;
      },
      onError: (error) => {
        refreshing.value = false;
        showToast(error instanceof Error ? error.message : String(error), 'error');
      }
    }
  );

  if (!data) return;

  status.value = data.statusResult;
  queueItems.value = data.queueResult.items;
  queueMeta.page = data.queueResult.meta.page;
  queueMeta.perPage = data.queueResult.meta.perPage;
  queueMeta.total = data.queueResult.meta.total;
  queueMeta.totalPages = data.queueResult.meta.totalPages;

  clearanceItems.value = data.departmentResult.items;
  clearanceMeta.page = data.departmentResult.meta.page;
  clearanceMeta.perPage = data.departmentResult.meta.perPage;
  clearanceMeta.total = data.departmentResult.meta.total;
  clearanceMeta.totalPages = data.departmentResult.meta.totalPages;
}

watch(queueSyncFilter, () => {
  queuePage.value = 1;
  void loadDashboard({ silent: true });
});

watch([clearanceStatusFilter, clearanceSearch], () => {
  clearancePage.value = 1;
  void loadDashboard({ silent: true });
});

watch(queuePage, () => {
  void loadDashboard({ silent: true });
});

watch(clearancePage, () => {
  void loadDashboard({ silent: true });
});

onMounted(async () => {
  await loadDashboard();
  realtime.startPolling(
    () => loadDashboard({ silent: true }),
    REALTIME_POLICY.polling.cashierMs,
    { immediate: false, pauseWhenDialogOpen: false }
  );
  requestAnimationFrame(() => {
    pageReady.value = true;
  });
});

onUnmounted(() => {
  realtime.stopPolling();
  realtime.invalidatePending();
});
</script>

<template>
  <div class="cashier-page">
    <template v-if="loading && !status">
      <v-card class="hero-card" variant="outlined">
        <v-card-text>
          <v-skeleton-loader type="heading, text" />
        </v-card-text>
      </v-card>
      <v-row>
        <v-col v-for="index in 4" :key="`cashier-card-skeleton-${index}`" cols="12" sm="6" lg="3">
          <v-skeleton-loader type="image, article" class="rounded-lg" />
        </v-col>
      </v-row>
      <v-skeleton-loader type="table-heading, table-row-divider@5" class="rounded-lg" />
    </template>

    <div v-else :class="['cashier-content', { 'is-ready': pageReady }]">
      <v-card class="hero-card" variant="outlined">
        <v-card-text class="d-flex justify-space-between flex-wrap ga-4">
          <div class="hero-copy">
            <div class="hero-kicker">Cashier Integration</div>
            <h1 class="text-h5 font-weight-black mb-2">Cashier Monitor</h1>
            <p class="hero-subtitle mb-0">{{ queueStatusText }}</p>
          </div>

          <div class="hero-actions">
            <v-chip :color="status?.enabled ? 'success' : 'warning'" variant="tonal" size="large">
              {{ syncModeLabel }}
            </v-chip>
            <v-chip color="info" variant="tonal" size="large">
              Sync mode: {{ status?.syncMode || 'queue' }}
            </v-chip>
            <v-chip color="warning" variant="tonal" size="large">
              Read-only access
            </v-chip>          </div>
        </v-card-text>
      </v-card>

      <AnalyticsCardGrid :items="summaryCards" md="6" lg="3" />

      <v-row>
        <v-col cols="12" lg="8">
          <v-card class="surface-card h-100" variant="outlined">
            <v-card-item>
              <v-card-title>Integration Readiness</v-card-title>
            </v-card-item>
            <v-divider />
            <v-card-text class="readiness-grid">
              <div class="readiness-tile">
                <span class="readiness-label">Cashier Endpoint</span>
                <strong>{{ status?.baseUrl || 'Not configured' }}</strong>
                <span class="text-medium-emphasis">{{ status?.inboundPath || '/api/integrations/cashier/payment-status' }}</span>
              </div>
              <div class="readiness-tile">
                <span class="readiness-label">Queue Totals</span>
                <strong>{{ status?.queue.pending || 0 }} pending</strong>
                <span class="text-medium-emphasis">{{ status?.queue.acknowledged || 0 }} acknowledged</span>
              </div>
              <div class="readiness-tile">
                <span class="readiness-label">UI Readiness</span>
                <strong>Read-only finance monitoring is active</strong>
                <span class="text-medium-emphasis">Payment edits and cashier approval actions are intentionally hidden from this screen.</span>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" lg="4">
          <v-card class="surface-card h-100" variant="outlined">
            <v-card-item>
              <v-card-title>Recent Payment Signals</v-card-title>
            </v-card-item>
            <v-divider />
            <v-list density="comfortable">
              <v-list-item v-for="payment in recentPaymentHighlights" :key="`${payment.source_module}-${payment.source_key}`">
                <template #title>{{ payment.source_module }} / {{ payment.source_key }}</template>
                <template #subtitle>
                  {{ formatMoney(payment.amount_paid, 'PHP') }} collected
                  <span class="text-medium-emphasis"> - balance {{ formatMoney(payment.balance_due, 'PHP') }}</span>
                </template>
                <template #append>
                  <v-chip :color="paymentStatusColor(payment.payment_status)" size="small" variant="tonal">{{ payment.payment_status }}</v-chip>
                </template>
              </v-list-item>
              <v-list-item v-if="!recentPaymentHighlights.length">
                <template #title>No recent cashier payment links yet.</template>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>
      </v-row>

      <v-card class="surface-card" variant="outlined">
        <v-tabs v-model="activeTab" bg-color="transparent" color="primary" class="cashier-tabs">
          <v-tab value="queue">Queue Monitor</v-tab>
          <v-tab value="clearance">Clearance Desk</v-tab>
          <v-tab value="payments">Recent Payments</v-tab>
        </v-tabs>
        <v-divider />

        <v-window v-model="activeTab">
          <v-window-item value="queue">
            <v-card-text>
              <div class="toolbar-row">
                <div class="chip-row">
                  <button
                    v-for="item in queueFilterItems"
                    :key="item.value"
                    type="button"
                    :class="['filter-chip', { active: queueSyncFilter === item.value }]"
                    @click="queueSyncFilter = item.value"
                  >
                    {{ item.label }}
                  </button>
                </div>
                <div class="text-medium-emphasis text-body-2">
                  {{ queueMeta.total }} queue items
                </div>
              </div>

              <div class="table-shell">
                <v-table density="comfortable">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Patient</th>
                      <th>Amount</th>
                      <th>Payment</th>
                      <th>Sync</th>
                      <th>Created</th>
                      <th class="text-right">Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in queueItems" :key="item.id">
                      <td>
                        <div class="font-weight-bold">{{ item.reference_no }}</div>
                        <div class="text-caption text-medium-emphasis">{{ item.source_module }} / {{ item.source_key }}</div>
                      </td>
                      <td>
                        <div>{{ item.patient_name || 'Unknown patient' }}</div>
                        <div class="text-caption text-medium-emphasis">{{ item.patient_type || 'unknown' }}</div>
                      </td>
                      <td>{{ formatMoney(item.amount_due, item.currency_code || 'PHP') }}</td>
                      <td>
                        <v-chip :color="paymentStatusColor(item.payment_status)" size="small" variant="tonal">
                          {{ item.payment_status }}
                        </v-chip>
                      </td>
                      <td>
                        <v-chip :color="syncStatusColor(item.sync_status)" size="small" variant="tonal">
                          {{ item.sync_status }}
                        </v-chip>
                      </td>
                      <td>{{ formatDateTime(item.created_at) }}</td>
                      <td class="text-right">
                        <v-chip size="small" variant="tonal" color="warning">Read-only</v-chip>
                      </td>
                    </tr>
                    <tr v-if="!queueItems.length">
                      <td colspan="7" class="text-center text-medium-emphasis py-8">No cashier queue items for the current filter.</td>
                    </tr>
                  </tbody>
                </v-table>
              </div>

              <div class="pagination-row">
                <div class="text-medium-emphasis text-body-2">Page {{ queueMeta.page }} of {{ queueMeta.totalPages }}</div>
                <v-pagination v-model="queuePage" :length="queueMeta.totalPages" density="comfortable" rounded="circle" />
              </div>
            </v-card-text>
          </v-window-item>

          <v-window-item value="clearance">
            <v-card-text>
              <div class="toolbar-row toolbar-stack">
                <div class="chip-row">
                  <button
                    v-for="item in clearanceFilterItems"
                    :key="item.value"
                    type="button"
                    :class="['filter-chip', { active: clearanceStatusFilter === item.value }]"
                    @click="clearanceStatusFilter = item.value"
                  >
                    {{ item.label }}
                  </button>
                </div>
                <v-text-field
                  v-model="clearanceSearch"
                  placeholder="Search patient, clearance reference, or external reference"
                  prepend-inner-icon="mdi-magnify"
                  variant="outlined"
                  density="comfortable"
                  hide-details
                  class="clearance-search"
                />
              </div>

              <div class="table-shell">
                <v-table density="comfortable">
                  <thead>
                    <tr>
                      <th>Clearance</th>
                      <th>Patient</th>
                      <th>Status</th>
                      <th>Requested By</th>
                      <th>Decision</th>
                      <th class="text-right">Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="record in clearanceItems" :key="record.clearance_reference">
                      <td>
                        <div class="font-weight-bold">{{ record.clearance_reference }}</div>
                        <div class="text-caption text-medium-emphasis">{{ record.external_reference || record.patient_code || '--' }}</div>
                      </td>
                      <td>
                        <div>{{ record.patient_name }}</div>
                        <div class="text-caption text-medium-emphasis">{{ record.patient_type }}</div>
                      </td>
                      <td>
                        <v-chip :color="clearanceStatusColor(record.status)" size="small" variant="tonal">{{ record.status }}</v-chip>
                      </td>
                      <td>{{ record.requested_by || 'System' }}</td>
                      <td>
                        <div>{{ record.approver_name || '--' }}</div>
                        <div class="text-caption text-medium-emphasis">{{ record.decided_at ? formatDateTime(record.decided_at) : 'No decision yet' }}</div>
                      </td>
                      <td class="text-right">
                        <v-chip size="small" variant="tonal" color="warning">Read-only</v-chip>
                      </td>
                    </tr>
                    <tr v-if="!clearanceItems.length">
                      <td colspan="6" class="text-center text-medium-emphasis py-8">No cashier clearance records found.</td>
                    </tr>
                  </tbody>
                </v-table>
              </div>

              <div class="pagination-row">
                <div class="text-medium-emphasis text-body-2">Page {{ clearanceMeta.page }} of {{ clearanceMeta.totalPages }}</div>
                <v-pagination v-model="clearancePage" :length="clearanceMeta.totalPages" density="comfortable" rounded="circle" />
              </div>
            </v-card-text>
          </v-window-item>

          <v-window-item value="payments">
            <v-card-text>
              <v-row>
                <v-col v-for="payment in status?.recentPayments || []" :key="`${payment.source_module}-${payment.source_key}-${payment.updated_at}`" cols="12" md="6" xl="4">
                  <v-card class="payment-card h-100" variant="outlined">
                    <v-card-text>
                      <div class="d-flex justify-space-between ga-3">
                        <div>
                          <div class="font-weight-bold">{{ payment.source_module }} / {{ payment.source_key }}</div>
                          <div class="text-caption text-medium-emphasis">{{ payment.cashier_reference || 'No cashier reference yet' }}</div>
                        </div>
                        <v-chip :color="paymentStatusColor(payment.payment_status)" size="small" variant="tonal">{{ payment.payment_status }}</v-chip>
                      </div>

                      <div class="payment-figures">
                        <div>
                          <span class="figure-label">Amount Due</span>
                          <strong>{{ formatMoney(payment.amount_due, 'PHP') }}</strong>
                        </div>
                        <div>
                          <span class="figure-label">Collected</span>
                          <strong>{{ formatMoney(payment.amount_paid, 'PHP') }}</strong>
                        </div>
                        <div>
                          <span class="figure-label">Balance</span>
                          <strong>{{ formatMoney(payment.balance_due, 'PHP') }}</strong>
                        </div>
                      </div>

                      <div class="text-caption text-medium-emphasis">
                        Updated {{ formatDateTime(payment.updated_at) }}
                        <span v-if="payment.official_receipt"> - OR {{ payment.official_receipt }}</span>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
                <v-col v-if="!(status?.recentPayments || []).length" cols="12">
                  <div class="text-center text-medium-emphasis py-8">No recent cashier payments recorded yet.</div>
                </v-col>
              </v-row>
            </v-card-text>
          </v-window-item>
        </v-window>
      </v-card>

      <ModuleActivityLogs module="cashier_integration" title="Cashier Integration Activity" :per-page="10" />
    </div>

    <v-snackbar v-model="toast.open" :color="toast.color" timeout="2800">{{ toast.text }}</v-snackbar>
  </div>
</template>

<style scoped>
.cashier-page {
  display: grid;
  gap: 16px;
  background:
    radial-gradient(900px 520px at 5% -10%, rgba(34, 197, 94, 0.14), transparent 60%),
    radial-gradient(760px 460px at 96% 0%, rgba(59, 130, 246, 0.14), transparent 55%);
}

.cashier-content {
  display: grid;
  gap: 16px;
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 240ms ease, transform 240ms ease;
}

.cashier-content.is-ready {
  opacity: 1;
  transform: translateY(0);
}

.hero-card {
  border-radius: 18px;
  border-color: #d7e4ff !important;
  color: #1d3557;
  background: linear-gradient(120deg, #f4f8ff 0%, #eef4ff 45%, #f8faff 100%);
  box-shadow: 0 10px 28px rgba(37, 99, 235, 0.08);
}

.hero-copy {
  max-width: 760px;
}

.hero-kicker {
  display: inline-flex;
  margin-bottom: 10px;
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(47, 128, 237, 0.08);
  border: 1px solid rgba(47, 128, 237, 0.18);
  color: #2f5c9f;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
}

.hero-subtitle {
  color: #5b6f8e;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 10px;
}

.surface-card {
  border-radius: 16px;
  border-color: #dbe5f1 !important;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
}

.readiness-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.readiness-tile {
  display: grid;
  gap: 6px;
  min-height: 120px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(85, 110, 160, 0.18);
  background: #f7fbff;
}

.readiness-label {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: #4f678d;
}

.cashier-tabs {
  padding-inline: 10px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.toolbar-stack {
  align-items: stretch;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-chip {
  border: 1px solid rgba(70, 106, 174, 0.2);
  border-radius: 999px;
  padding: 7px 12px;
  background: #f7faff;
  color: #47608b;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 160ms ease;
}

.filter-chip.active {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(120deg, #16816d 0%, #2f98d0 100%);
  box-shadow: 0 10px 18px rgba(22, 129, 109, 0.18);
}

.clearance-search {
  max-width: 440px;
}

.table-shell {
  overflow: auto;
  border-radius: 14px;
  border: 1px solid rgba(126, 150, 190, 0.14);
}

.table-shell :deep(table) {
  min-width: 960px;
}

.table-shell :deep(thead th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f6faff;
  font-size: 12px;
  letter-spacing: 0.4px;
}

.action-row {
  display: inline-flex;
  justify-content: flex-end;
  gap: 8px;
}

.pagination-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
}

.payment-card {
  border-radius: 14px;
  border-color: rgba(90, 119, 173, 0.16) !important;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.payment-figures {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0 14px;
}

.figure-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #60799f;
}

.dialog-card {
  border-radius: 18px;
}

.saas-btn {
  border-radius: 12px !important;
  min-height: 40px !important;
  text-transform: none !important;
  font-weight: 700 !important;
}

.saas-btn-primary {
  background: linear-gradient(120deg, #15796f 0%, #2b8ccb 100%) !important;
  color: #fff !important;
  box-shadow: 0 8px 16px rgba(23, 111, 128, 0.24);
}

.saas-btn-light {
  background: #f5f9ff !important;
  color: #345381 !important;
  border: 1px solid rgba(52, 92, 168, 0.2) !important;
}

.saas-btn-ghost {
  background: #f5f9ff !important;
  color: #345381 !important;
  border: 1px solid rgba(52, 92, 168, 0.2) !important;
}

@media (max-width: 1080px) {
  .readiness-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .hero-actions,
  .toolbar-row,
  .pagination-row {
    flex-direction: column;
    align-items: stretch;
  }

  .clearance-search {
    max-width: none;
  }

  .payment-figures {
    grid-template-columns: 1fr;
  }
}
</style>

