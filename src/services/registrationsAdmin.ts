export type RegistrationStatus = 'Pending' | 'Review' | 'Active' | 'Archived';

export type RegistrationRow = {
  id: number;
  case_id: string;
  patient_name: string;
  patient_email: string;
  age: number;
  concern: string;
  intake_time: string;
  booked_time: string;
  status: RegistrationStatus;
  assigned_to: string;
};

export type RegistrationAnalytics = {
  pending: number;
  active: number;
  concerns: number;
  approvalRate: number;
};

export type RegistrationListPayload = {
  analytics: RegistrationAnalytics;
  items: RegistrationRow[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
};

type RegistrationApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
};

type RegistrationQuery = {
  search?: string;
  status?: string;
  sort?: string;
  page?: number;
  perPage?: number;
};

export type RegistrationUpsertPayload = {
  id?: number;
  patient_name?: string;
  patient_email?: string;
  age?: number;
  concern?: string;
  intake_time?: string;
  booked_time?: string;
  status?: RegistrationStatus;
  assigned_to?: string;
};

export type RegistrationAction =
  | 'create'
  | 'update'
  | 'approve'
  | 'reject'
  | 'archive'
  | 'assign'
  | 'set_status';

type RegistrationActionPayload = {
  id?: number;
  reason?: string;
  status?: RegistrationStatus;
  assigned_to?: string;
} & RegistrationUpsertPayload;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveApiUrl(): string {
  const directApi = import.meta.env.VITE_REGISTRATIONS_API_URL?.trim();
  if (directApi) {
    return trimTrailingSlashes(directApi);
  }

  const configured = import.meta.env.VITE_BACKEND_API_BASE_URL?.trim();
  if (configured) {
    return `${trimTrailingSlashes(configured)}/registrations`;
  }

  return '/api/registrations';
}

function buildUrl(query: RegistrationQuery = {}): string {
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

async function parseResponse<T>(response: Response): Promise<RegistrationApiResponse<T>> {
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as RegistrationApiResponse<T>) : ({ ok: false } as RegistrationApiResponse<T>);
  if (!response.ok || !payload.ok) {
    throw payload.message || `Request failed (${response.status})`;
  }
  return payload;
}

async function executeRegistrationAction(action: RegistrationAction, payload: RegistrationActionPayload): Promise<RegistrationRow> {
  const response = await fetch(resolveApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      action,
      ...payload
    })
  });
  const parsed = await parseResponse<RegistrationRow>(response);
  if (!parsed.data) throw `No ${action} registration returned.`;
  return parsed.data;
}

export async function fetchRegistrations(query: RegistrationQuery = {}): Promise<RegistrationListPayload> {
  const response = await fetch(buildUrl(query), { credentials: 'include' });
  const payload = await parseResponse<RegistrationListPayload>(response);
  if (!payload.data) {
    throw 'No registration data returned.';
  }
  return payload.data;
}

export async function createRegistration(payload: RegistrationUpsertPayload): Promise<RegistrationRow> {
  if (!payload.patient_name?.trim()) throw 'patient_name is required.';
  return await executeRegistrationAction('create', payload);
}

export async function updateRegistration(payload: RegistrationUpsertPayload): Promise<RegistrationRow> {
  return await executeRegistrationAction('update', payload);
}

export async function approveRegistration(id: number): Promise<RegistrationRow> {
  return await executeRegistrationAction('approve', { id });
}

export async function rejectRegistration(id: number, reason: string): Promise<RegistrationRow> {
  return await executeRegistrationAction('reject', { id, reason });
}

export async function archiveRegistration(id: number, reason: string): Promise<RegistrationRow> {
  return await executeRegistrationAction('archive', { id, reason });
}

export async function assignRegistration(id: number, assigned_to: string): Promise<RegistrationRow> {
  return await executeRegistrationAction('assign', { id, assigned_to });
}

export async function setRegistrationStatus(id: number, status: RegistrationStatus): Promise<RegistrationRow> {
  return await executeRegistrationAction('set_status', { id, status });
}
