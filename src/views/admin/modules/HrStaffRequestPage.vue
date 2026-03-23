<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import AnalyticsCardGrid from '@/components/shared/AnalyticsCardGrid.vue';
import ModuleActivityLogs from '@/components/shared/ModuleActivityLogs.vue';
import { useRealtimeListSync } from '@/composables/useRealtimeListSync';
import { REALTIME_POLICY } from '@/config/realtimePolicy';
import { emitSuccessModal } from '@/composables/useSuccessModal';
import {
  createHrStaffRequest,
  fetchHrStaffRequestStatus,
  fetchHrStaffRequests,
  type HrStaffRequestRow,
  type HrStaffRequestStatus
} from '@/services/hrStaffRequests';

const realtime = useRealtimeListSync();
const loading = ref(true);
const requestLoading = ref(false);
const requesting = ref(false);

const status = ref<HrStaffRequestStatus | null>(null);
const requests = ref<HrStaffRequestRow[]>([]);
const requestMeta = reactive({ page: 1, perPage: 10, total: 0, totalPages: 1 });
const requestSearch = ref('');
const requestStatus = ref<'all' | 'pending' | 'approved' | 'rejected' | 'queue' | 'waiting_applicant' | 'hiring' | 'hired'>('all');
const requestPage = ref(1);

const staffDialog = ref(false);
const requestedRole = ref<'doctor' | 'nurse'>('doctor');
const requestedCount = ref(1);
const requestNotes = ref('');
const requestedBy = ref('Clinic Admin');
const toast = reactive({ open: false, text: '', color: 'info' as 'success' | 'info' | 'warning' | 'error' });

const cards = computed(() => [
  { title: 'Active HR Roster', value: status.value?.totals.activeRoster || 0, subtitle: 'Doctor/Nurse in active status', className: 'analytics-card-blue', icon: 'mdi-account-check-outline' },
  { title: 'Working HR Roster', value: status.value?.totals.workingRoster || 0, subtitle: 'Currently working', className: 'analytics-card-green', icon: 'mdi-stethoscope' },
  { title: 'Pending Requests', value: status.value?.totals.pendingRequests || 0, subtitle: 'Awaiting HR action', className: 'analytics-card-orange', icon: 'mdi-timer-sand' },
  { title: 'Approved Requests', value: status.value?.totals.approvedRequests || 0, subtitle: 'Approved by HR', className: 'analytics-card-purple', icon: 'mdi-check-decagram-outline' }
]);

function showToast(text: string, color: 'success' | 'info' | 'warning' | 'error' = 'info'): void {
  if (color === 'success') {
    emitSuccessModal({ title: 'Success', message: text, tone: 'success' });
    return;
  }
  toast.text = text;
  toast.color = color;
  toast.open = true;
}
function formatDateTime(value: string | null | undefined): string {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
function roleColor(value: string): string { return value === 'doctor' ? 'primary' : 'deep-orange'; }
function statusColor(value: string): string {
  if (value === 'approved' || value === 'hired') return 'success';
  if (value === 'rejected') return 'error';
  if (value === 'hiring') return 'primary';
  if (value === 'waiting_applicant') return 'info';
  if (value === 'queue') return 'warning';
  return 'warning';
}

async function loadStatus(): Promise<void> {
  const data = await realtime.runLatest(async () => fetchHrStaffRequestStatus(), { onError: (e) => showToast(e instanceof Error ? e.message : String(e), 'error') });
  if (data) status.value = data;
}
async function loadRequests(options: { silent?: boolean } = {}): Promise<void> {
  const data = await realtime.runLatest(
    async () => fetchHrStaffRequests({ search: requestSearch.value.trim() || undefined, status: requestStatus.value === 'all' ? undefined : requestStatus.value, page: requestPage.value, perPage: requestMeta.perPage }),
    { silent: options.silent, onStart: () => { if (!options.silent) requestLoading.value = true; }, onFinish: () => { requestLoading.value = false; }, onError: (e) => showToast(e instanceof Error ? e.message : String(e), 'error') }
  );
  if (!data) return;
  requests.value = data.items;
  Object.assign(requestMeta, data.meta);
}
function openRequestModal(): void {
  staffDialog.value = true;
  requestedRole.value = 'doctor';
  requestedCount.value = 1;
  requestNotes.value = '';
}
async function submitRequest(): Promise<void> {
  if (!requestedRole.value) return showToast('Select role first.', 'warning');
  requesting.value = true;
  try {
    await createHrStaffRequest({
      roleType: requestedRole.value,
      requestedCount: requestedCount.value,
      requestedBy: requestedBy.value,
      requestNotes: requestNotes.value
    });
    staffDialog.value = false;
    await Promise.all([loadStatus(), loadRequests()]);
    showToast('Doctor/Nurse request sent to HR.', 'success');
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    requesting.value = false;
  }
}

let requestDebounce: ReturnType<typeof setTimeout> | null = null;
watch(requestSearch, () => {
  if (requestDebounce) clearTimeout(requestDebounce);
  requestDebounce = setTimeout(() => { requestPage.value = 1; void loadRequests(); }, REALTIME_POLICY.debounce.registrationSearchMs);
});
watch(requestStatus, () => { requestPage.value = 1; void loadRequests(); });
watch(requestPage, () => { void loadRequests(); });

onMounted(async () => {
  await Promise.all([loadStatus(), loadRequests()]);
  loading.value = false;
  realtime.startPolling(async () => {
    await loadStatus();
    await loadRequests({ silent: true });
  }, REALTIME_POLICY.polling.cashierMs);
});
onUnmounted(() => {
  if (requestDebounce) clearTimeout(requestDebounce);
  realtime.stopPolling();
  realtime.invalidatePending();
});
</script>

<template>
  <div class="hr-request-page">
    <v-card class="hero-card" variant="outlined">
      <v-card-text class="d-flex justify-space-between align-center flex-wrap ga-3">
        <div>
          <div class="hero-kicker">HR Integration</div>
          <h1 class="text-h5 font-weight-black mb-1">Request Doctor/Nurse</h1>
          <p class="text-medium-emphasis mb-0">Create staffing requests and monitor approval from HR.</p>
        </div>
        <v-btn class="saas-btn" color="primary" rounded="pill" prepend-icon="mdi-account-plus-outline" @click="openRequestModal">Request Doctor/Nurse</v-btn>
      </v-card-text>
    </v-card>

    <AnalyticsCardGrid :items="cards" md="6" lg="3" />

    <v-card variant="outlined">
      <v-card-item><v-card-title>Requested Doctor/Nurse in HR</v-card-title></v-card-item>
      <v-card-text>
        <v-row class="mb-2">
          <v-col cols="12" md="8"><v-text-field v-model="requestSearch" label="Search request, employee no, name" prepend-inner-icon="mdi-magnify" variant="outlined" density="comfortable" hide-details /></v-col>
          <v-col cols="12" md="4"><v-select v-model="requestStatus" :items="['all', 'pending', 'queue', 'waiting_applicant', 'hiring', 'approved', 'hired', 'rejected']" label="Status" variant="outlined" density="comfortable" hide-details /></v-col>
        </v-row>
        <v-progress-linear v-if="requestLoading" indeterminate color="primary" class="mb-2" />
        <v-table density="comfortable">
          <thead><tr><th>REQUEST</th><th>STAFF</th><th>ROLE</th><th>STATUS</th><th>REQUESTED BY</th><th>CREATED</th></tr></thead>
          <tbody>
            <tr v-for="row in requests" :key="row.id">
              <td><div class="font-weight-bold">{{ row.request_reference }}</div><div class="text-caption text-medium-emphasis">{{ row.employee_no }}</div></td>
              <td>{{ row.staff_name }}</td>
              <td><v-chip size="small" variant="tonal" :color="roleColor(row.role_type)">{{ row.role_type }}</v-chip></td>
              <td><v-chip size="small" variant="tonal" :color="statusColor(row.request_status)">{{ row.request_status }}</v-chip></td>
              <td>{{ row.requested_by || '--' }}</td>
              <td>{{ formatDateTime(row.created_at) }}</td>
            </tr>
            <tr v-if="!requestLoading && requests.length === 0"><td colspan="6" class="text-center text-medium-emphasis py-6">No requests found.</td></tr>
          </tbody>
        </v-table>
        <div class="d-flex align-center mt-3 text-caption text-medium-emphasis">
          <span>Showing {{ requests.length }} of {{ requestMeta.total }}</span>
          <v-spacer />
          <v-pagination v-model="requestPage" :length="requestMeta.totalPages" density="comfortable" />
        </div>
      </v-card-text>
    </v-card>

    <ModuleActivityLogs module="hr_staff_request" title="Doctor/Nurse Request Activity" :per-page="10" />

    <v-dialog v-model="staffDialog" max-width="720">
      <v-card>
        <v-card-item><v-card-title>Request Additional Doctor/Nurse from HR</v-card-title></v-card-item>
        <v-card-text>
          <v-row class="mb-2">
            <v-col cols="12" md="6">
              <v-select
                v-model="requestedRole"
                :items="['doctor', 'nurse']"
                label="Requested role"
                variant="outlined"
                density="comfortable"
                hide-details
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="requestedCount"
                type="number"
                min="1"
                label="Requested count"
                variant="outlined"
                density="comfortable"
                hide-details
              />
            </v-col>
          </v-row>
          <v-row class="mt-2">
            <v-col cols="12" md="4"><v-text-field v-model="requestedBy" label="Requested by" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="12" md="8"><v-textarea v-model="requestNotes" label="Request notes" rows="2" variant="outlined" density="comfortable" /></v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="justify-end"><v-btn variant="text" @click="staffDialog = false">Cancel</v-btn><v-btn color="primary" :loading="requesting" @click="submitRequest">Send Request</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="toast.open" :color="toast.color" timeout="2800">{{ toast.text }}</v-snackbar>
  </div>
</template>

<style scoped>
.hr-request-page { display: grid; gap: 16px; }
.hero-card { border-radius: 16px; border-color: #d7e4ff !important; background: linear-gradient(120deg, #f4f8ff 0%, #eef4ff 45%, #f8faff 100%); }
.hero-kicker { display: inline-flex; margin-bottom: 10px; border-radius: 999px; padding: 4px 10px; background: rgba(47, 128, 237, 0.08); border: 1px solid rgba(47, 128, 237, 0.18); color: #2f5c9f; font-size: 12px; font-weight: 800; letter-spacing: 0.7px; text-transform: uppercase; }
.saas-btn { text-transform: none; font-weight: 700; }
</style>
