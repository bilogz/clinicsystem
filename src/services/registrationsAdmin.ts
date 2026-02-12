export type RegistrationStatus = 'Pending' | 'Active' | 'Archived';

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
  patient_name: string;
  patient_email?: string;
  age?: number;
  concern?: string;
  intake_time?: string;
  booked_time?: string;
  status?: RegistrationStatus;
  assigned_to?: string;
};

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

export async function fetchRegistrations(query: RegistrationQuery = {}): Promise<RegistrationListPayload> {
  const response = await fetch(buildUrl(query), { credentials: 'include' });
  const payload = await parseResponse<RegistrationListPayload>(response);
  if (!payload.data) {
    throw 'No registration data returned.';
  }
  return payload.data;
}

export async function createRegistration(payload: RegistrationUpsertPayload): Promise<RegistrationRow> {
  const response = await fetch(resolveApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      action: 'create',
      ...payload
    })
  });
  const parsed = await parseResponse<RegistrationRow>(response);
  if (!parsed.data) throw 'No created registration returned.';
  return parsed.data;
}

export async function updateRegistration(payload: RegistrationUpsertPayload): Promise<RegistrationRow> {
  const response = await fetch(resolveApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      action: 'update',
      ...payload
    })
  });
  const parsed = await parseResponse<RegistrationRow>(response);
  if (!parsed.data) throw 'No updated registration returned.';
  return parsed.data;
}

export async function approveRegistration(id: number): Promise<RegistrationRow> {
  const response = await fetch(resolveApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      action: 'approve',
      id
    })
  });
  const parsed = await parseResponse<RegistrationRow>(response);
  if (!parsed.data) throw 'No approved registration returned.';
  return parsed.data;
}
