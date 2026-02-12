export type Severity = 'Low' | 'Moderate' | 'Emergency';
export type WalkInStatus = 'waiting' | 'identified' | 'triage_pending' | 'in_triage' | 'waiting_for_doctor' | 'completed' | 'emergency';

export type WalkInCase = {
  id: number;
  case_id: string;
  patient_name: string;
  age: number;
  contact: string;
  chief_complaint: string;
  severity: Severity;
  intake_time: string;
  assigned_doctor: string;
  status: WalkInStatus;
};

export type WalkInAnalytics = {
  all: number;
  triage: number;
  doctor: number;
  emergency: number;
  completed: number;
};

export type WalkInListPayload = {
  analytics: WalkInAnalytics;
  items: WalkInCase[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
};

type ApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
};

type WalkInQuery = {
  search?: string;
  status?: string;
  severity?: string;
  page?: number;
  perPage?: number;
};

export type CreateWalkInPayload = {
  patient_name: string;
  age?: number;
  contact?: string;
  chief_complaint?: string;
  severity?: Severity;
  assigned_doctor?: string;
};

export type WalkInActionPayload = {
  action: 'identify' | 'queue_triage' | 'start_triage' | 'triage' | 'assign' | 'complete' | 'emergency';
  id: number;
  chief_complaint?: string;
  severity?: Severity;
  assigned_doctor?: string;
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveApiUrl(): string {
  const directApi = import.meta.env.VITE_WALKINS_API_URL?.trim();
  if (directApi) return trimTrailingSlashes(directApi);
  const configured = import.meta.env.VITE_BACKEND_API_BASE_URL?.trim();
  if (configured) return `${trimTrailingSlashes(configured)}/walk-ins`;
  return '/api/walk-ins';
}

function buildUrl(query: WalkInQuery = {}): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    const mapped = key === 'perPage' ? 'per_page' : key;
    params.set(mapped, String(value));
  });
  const suffix = params.toString();
  const base = resolveApiUrl();
  return suffix ? `${base}?${suffix}` : base;
}

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as ApiResponse<T>) : ({ ok: false } as ApiResponse<T>);
  if (!response.ok || !payload.ok) throw payload.message || `Request failed (${response.status})`;
  return payload;
}

export async function fetchWalkIns(query: WalkInQuery = {}): Promise<WalkInListPayload> {
  const response = await fetch(buildUrl(query), { credentials: 'include' });
  const payload = await parseResponse<WalkInListPayload>(response);
  if (!payload.data) throw 'No walk-in data returned.';
  return payload.data;
}

export async function createWalkIn(payload: CreateWalkInPayload): Promise<WalkInCase> {
  const response = await fetch(resolveApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      action: 'create',
      ...payload
    })
  });
  const parsed = await parseResponse<WalkInCase>(response);
  if (!parsed.data) throw 'No created walk-in returned.';
  return parsed.data;
}

export async function runWalkInAction(payload: WalkInActionPayload): Promise<WalkInCase> {
  const response = await fetch(resolveApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  const parsed = await parseResponse<WalkInCase>(response);
  if (!parsed.data) throw 'No updated walk-in returned.';
  return parsed.data;
}
