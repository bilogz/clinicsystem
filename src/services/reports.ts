import { fetchApiData, invalidateApiCache } from '@/services/apiClient';

export type ReportsKpis = {
  totalPatients: number;
  activeProfiles: number;
  highRiskPatients: number;
  totalVisits: number;
  pendingQueue: number;
  emergencyCases: number;
  dispensedItems: number;
};

export type ReportsModuleTotal = {
  module: string;
  total: number;
};

export type ReportsTrendRow = {
  day: string;
  appointments: number;
  walkin: number;
  checkup: number;
  mental: number;
  pharmacy: number;
};

export type ReportsActivityRow = {
  module: string;
  action: string;
  detail: string;
  actor: string;
  created_at: string;
};

export type ReportsPmedMetric = {
  label: string;
  total: number;
};

export type ReportsPmedSection = {
  key: string;
  title: string;
  source: string;
  metrics: ReportsPmedMetric[];
};

export type ReportsPmedDelivery = {
  action: string;
  detail: string;
  actor: string;
  entity_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ReportsPmedRequestNotification = {
  action: string;
  detail: string;
  actor: string;
  entity_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ReportsPmedPackage = {
  title: string;
  description: string;
  sections: ReportsPmedSection[];
  summary: {
    section_count: number;
    source_count: number;
    metric_count: number;
    sources: string[];
  };
  recent_deliveries: ReportsPmedDelivery[];
};

export type ReportsSnapshot = {
  generatedAt: string;
  window: { from: string; to: string };
  kpis: ReportsKpis;
  moduleTotals: ReportsModuleTotal[];
  dailyTrend: ReportsTrendRow[];
  recentActivity: ReportsActivityRow[];
  pmedPackage: ReportsPmedPackage;
  pmedRequestNotifications: ReportsPmedRequestNotification[];
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveApiUrl(): string {
  const directApi = import.meta.env.VITE_REPORTS_API_URL?.trim();
  if (directApi) return trimTrailingSlashes(directApi);
  const configured = import.meta.env.VITE_BACKEND_API_BASE_URL?.trim();
  if (configured) return `${trimTrailingSlashes(configured)}/reports`;
  return '/api/reports';
}

export async function fetchReportsSnapshot(
  filters: { from?: string; to?: string; forceRefresh?: boolean } = {}
): Promise<ReportsSnapshot> {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const url = `${resolveApiUrl()}${params.toString() ? `?${params.toString()}` : ''}`;
  return await fetchApiData<ReportsSnapshot>(url, {
    ttlMs: 3_000,
    forceRefresh: filters.forceRefresh
  });
}

export async function fetchPmedReportNotifications(forceRefresh = false): Promise<ReportsPmedRequestNotification[]> {
  const snapshot = await fetchApiData<ReportsSnapshot>(resolveApiUrl(), {
    ttlMs: 12_000,
    forceRefresh,
    cacheKey: 'reports-notifications'
  });
  return snapshot?.pmedRequestNotifications || [];
}

export async function sendReportsToPmed(payload: { actor?: string } = {}): Promise<{ reportKey: string; package: ReportsPmedPackage }> {
  const result = await fetchApiData<{ reportKey: string; package: ReportsPmedPackage }>(resolveApiUrl(), {
    method: 'POST',
    body: {
      action: 'send_to_pmed',
      actor: payload.actor || 'Reports Admin'
    }
  });
  invalidateApiCache('/api/reports');
  invalidateApiCache('reports-notifications');
  invalidateApiCache('/api/module-activity');
  return result;
}
