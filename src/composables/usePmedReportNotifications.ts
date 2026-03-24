import { computed, reactive, readonly, ref } from 'vue';
import { REALTIME_POLICY } from '@/config/realtimePolicy';
import { fetchPmedReportNotifications, type ReportsPmedRequestNotification } from '@/services/reports';

const KNOWN_REQUESTS_STORAGE_KEY = 'clinic:pmed-report-request-ids';
const MAX_STORED_REQUEST_IDS = 50;

const notifications = ref<ReportsPmedRequestNotification[]>([]);
const loading = ref(false);
const popup = reactive({
  open: false,
  title: 'PMED report request received',
  message: ''
});

const notificationCount = computed(() => notifications.value.length);

const knownRequestIds = new Set<string>();
let hasBootstrapped = false;
// Timeout-chain state (replaces raw setInterval to avoid overlap / pileup)
let pollingTimer: ReturnType<typeof setTimeout> | null = null;
let pollInFlight = false;
let activeConsumers = 0;

function requestKey(row: ReportsPmedRequestNotification): string {
  const reportReference =
    String(row.metadata?.report_reference || row.metadata?.report_name || '').trim() || row.entity_key;
  return `${reportReference}|${row.created_at}|${row.action}`;
}

function readStoredRequestIds(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(KNOWN_REQUESTS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    parsed
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .slice(-MAX_STORED_REQUEST_IDS)
      .forEach((value) => knownRequestIds.add(value));
  } catch {
    localStorage.removeItem(KNOWN_REQUESTS_STORAGE_KEY);
  }
}

function persistKnownRequestIds(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const values = Array.from(knownRequestIds).slice(-MAX_STORED_REQUEST_IDS);
    localStorage.setItem(KNOWN_REQUESTS_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Ignore localStorage write failures. Live polling should still work.
  }
}

function announceNewRequests(rows: ReportsPmedRequestNotification[]): void {
  if (!rows.length) return;
  popup.title = rows.length > 1 ? 'New PMED report requests' : 'New PMED report request';
  popup.message =
    rows.length > 1
      ? `PMED requested ${rows.length} new clinic report submissions.`
      : rows[0]?.detail || 'PMED requested a new clinic report submission.';
  popup.open = true;
}

async function refresh(forceRefresh = false): Promise<void> {
  loading.value = true;
  try {
    const rows = await fetchPmedReportNotifications(forceRefresh);
    const nextNewRows = hasBootstrapped
      ? rows.filter((row) => !knownRequestIds.has(requestKey(row)))
      : [];

    notifications.value = rows;
    rows.forEach((row) => knownRequestIds.add(requestKey(row)));
    persistKnownRequestIds();

    if (hasBootstrapped) announceNewRequests(nextNewRows);
    else hasBootstrapped = true;
  } finally {
    loading.value = false;
  }
}

function scheduleNextPoll(): void {
  if (pollingTimer) clearTimeout(pollingTimer);
  pollingTimer = setTimeout(() => {
    void runPollTick();
  }, REALTIME_POLICY.polling.pmedNotificationsMs);
}

async function runPollTick(): Promise<void> {
  // Skip when the tab is hidden — reschedule for when the user returns
  if (typeof document !== 'undefined' && document.hidden) {
    scheduleNextPoll();
    return;
  }
  if (pollInFlight) {
    scheduleNextPoll();
    return;
  }
  pollInFlight = true;
  try {
    await refresh(true);
  } finally {
    pollInFlight = false;
    // Only reschedule if consumers are still registered
    if (activeConsumers > 0) scheduleNextPoll();
  }
}

function onVisibilityChange(): void {
  if (typeof document === 'undefined' || document.hidden) return;
  if (activeConsumers > 0) void runPollTick();
}

function startPolling(): void {
  activeConsumers += 1;
  if (activeConsumers > 1) return;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  void refresh(true);
  scheduleNextPoll();
}

function stopPolling(): void {
  activeConsumers = Math.max(0, activeConsumers - 1);
  if (activeConsumers > 0) return;
  if (pollingTimer) clearTimeout(pollingTimer);
  pollingTimer = null;
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }
}

function dismissPopup(): void {
  popup.open = false;
}

readStoredRequestIds();

export function usePmedReportNotifications() {
  return {
    notifications: readonly(notifications),
    loading: readonly(loading),
    notificationCount,
    popup,
    refresh,
    startPolling,
    stopPolling,
    dismissPopup
  };
}
