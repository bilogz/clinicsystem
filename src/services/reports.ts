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

export type ReportsSnapshot = {
  window: { from: string; to: string };
  kpis: ReportsKpis;
  moduleTotals: ReportsModuleTotal[];
  dailyTrend: ReportsTrendRow[];
  recentActivity: ReportsActivityRow[];
};

type ApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
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

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as ApiResponse<T>) : ({ ok: false } as ApiResponse<T>);
  if (!response.ok || !payload.ok) {
    throw payload.message || `Request failed (${response.status})`;
  }
  return payload;
}

export async function fetchReportsSnapshot(filters: { from?: string; to?: string } = {}): Promise<ReportsSnapshot> {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const url = `${resolveApiUrl()}${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url, { credentials: 'include' });
  const parsed = await parseResponse<ReportsSnapshot>(response);
  if (!parsed.data) throw 'No reports data returned.';
  return parsed.data;
}
