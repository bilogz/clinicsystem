export type AppointmentStatus = 'Confirmed' | 'Pending' | 'Canceled' | 'Accepted' | 'Awaiting';

export type AppointmentRow = {
  id: number;
  bookingId: string;
  patientName: string;
  patientEmail: string;
  phoneNumber: string;
  service: string;
  department: string;
  doctor: string;
  scheduleDate: string;
  scheduleTime: string;
  status: AppointmentStatus;
  visitReason: string;
  createdAt: string;
  updatedAt: string;
};

export type AppointmentAnalytics = {
  totalPatients: number;
  totalAppointments: number;
  todayAppointments: number;
  pendingQueue: number;
};

export type AppointmentQuery = {
  search?: string;
  status?: string;
  service?: string;
  doctor?: string;
  period?: string;
  page?: number;
  perPage?: number;
};

export type AppointmentListPayload = {
  analytics: AppointmentAnalytics;
  items: AppointmentRow[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
};

type AppointmentApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
};

type UpdateAppointmentPayload = {
  booking_id: string;
  status?: string;
  doctor_name?: string;
  department_name?: string;
  visit_type?: string;
  appointment_date?: string;
  preferred_time?: string;
  visit_reason?: string;
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveApiUrl(): string {
  const configured = import.meta.env.VITE_BACKEND_API_BASE_URL?.trim();
  if (configured) {
    return `${trimTrailingSlashes(configured)}/appointments_admin.php`;
  }
  return '/backend/api/appointments_admin.php';
}

function buildUrl(query: AppointmentQuery = {}): string {
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

function toStatus(value: string): AppointmentStatus {
  const lowered = value.trim().toLowerCase();
  if (lowered === 'confirmed') return 'Confirmed';
  if (lowered === 'pending') return 'Pending';
  if (lowered === 'accepted') return 'Accepted';
  if (lowered === 'awaiting') return 'Awaiting';
  return 'Canceled';
}

function normalizeRow(item: Record<string, unknown>): AppointmentRow {
  return {
    id: Number(item.id || 0),
    bookingId: String(item.booking_id || ''),
    patientName: String(item.patient_name || ''),
    patientEmail: String(item.patient_email || ''),
    phoneNumber: String(item.phone_number || ''),
    service: String(item.service_name || ''),
    department: String(item.department_name || ''),
    doctor: String(item.doctor_name || ''),
    scheduleDate: String(item.appointment_date || ''),
    scheduleTime: String(item.preferred_time || ''),
    status: toStatus(String(item.status || 'Pending')),
    visitReason: String(item.visit_reason || ''),
    createdAt: String(item.created_at || ''),
    updatedAt: String(item.updated_at || '')
  };
}

async function parseResponse<T>(response: Response): Promise<AppointmentApiResponse<T>> {
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as AppointmentApiResponse<T>) : ({ ok: false } as AppointmentApiResponse<T>);
  if (!response.ok || !payload.ok) {
    throw payload.message || `Request failed (${response.status})`;
  }
  return payload;
}

export async function fetchAppointments(query: AppointmentQuery = {}): Promise<AppointmentListPayload> {
  const response = await fetch(buildUrl(query), { credentials: 'include' });
  const payload = await parseResponse<{
    analytics: AppointmentAnalytics;
    items: Record<string, unknown>[];
    meta: { page: number; perPage: number; total: number; totalPages: number };
  }>(response);

  const data = payload.data;
  if (!data) {
    throw 'No appointment data returned.';
  }

  return {
    analytics: data.analytics || { totalPatients: 0, totalAppointments: 0, todayAppointments: 0, pendingQueue: 0 },
    items: Array.isArray(data.items) ? data.items.map((row) => normalizeRow(row)) : [],
    meta: data.meta || { page: 1, perPage: 10, total: 0, totalPages: 1 }
  };
}

export async function updateAppointment(payload: UpdateAppointmentPayload): Promise<AppointmentRow> {
  const response = await fetch(resolveApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      action: 'update',
      ...payload
    })
  });

  const parsed = await parseResponse<Record<string, unknown>>(response);
  if (!parsed.data) {
    throw 'No updated appointment returned.';
  }

  return normalizeRow(parsed.data);
}
