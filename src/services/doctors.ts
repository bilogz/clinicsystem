import { emitRealtimeRefresh } from '@/composables/useRealtimeListSync';
import { fetchApiData, invalidateApiCache } from '@/services/apiClient';
import { fetchHrStaffDirectory, type HrStaffDirectoryRow } from '@/services/hrStaffRequests';

export type DoctorRow = {
  id: number;
  doctorName: string;
  departmentName: string;
  specialization: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveApiUrl(): string {
  const configured = import.meta.env.VITE_BACKEND_API_BASE_URL?.trim();
  if (configured) return `${trimTrailingSlashes(configured)}/doctors`;
  return '/api/doctors';
}

function getCacheKey(filters: { departmentName?: string; includeInactive?: boolean }): string {
  return JSON.stringify({
    departmentName: String(filters.departmentName || '').trim().toLowerCase(),
    includeInactive: Boolean(filters.includeInactive)
  });
}

function normalizeDoctorRow(raw: Record<string, unknown>): DoctorRow {
  return {
    id: Number(raw.id || 0),
    doctorName: String(raw.doctor_name || ''),
    departmentName: String(raw.department_name || ''),
    specialization: String(raw.specialization || ''),
    isActive: Boolean(raw.is_active),
    createdAt: String(raw.created_at || ''),
    updatedAt: String(raw.updated_at || '')
  };
}

function normalizeHrDoctorRow(row: HrStaffDirectoryRow): DoctorRow {
  const status = String(row.employment_status || '').trim().toLowerCase();
  return {
    id: Number(row.id || 0),
    doctorName: String(row.full_name || '').trim(),
    departmentName: String(row.department_name || '').trim(),
    specialization: String(row.role_type || '').trim(),
    isActive: status === 'active' || status === 'working',
    createdAt: String(row.hired_at || ''),
    updatedAt: String(row.updated_at || '')
  };
}

function doctorKey(name: string, department: string): string {
  return `${String(name || '').trim().toLowerCase()}::${String(department || '').trim().toLowerCase()}`;
}

async function listDoctorsFromHr(filters: { departmentName?: string; includeInactive?: boolean }): Promise<DoctorRow[]> {
  const merged: HrStaffDirectoryRow[] = [];
  let page = 1;
  const perPage = 200;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetchHrStaffDirectory({
      role: 'doctor',
      page,
      perPage
    });
    merged.push(...(response.items || []));
    totalPages = Number(response.meta?.totalPages || 1);
    page += 1;
    if (page > 10) break;
  }

  const departmentNeedle = String(filters.departmentName || '').trim().toLowerCase();
  const includeInactive = Boolean(filters.includeInactive);
  const normalized = merged
    .map((row) => normalizeHrDoctorRow(row))
    .filter((row) => row.doctorName && row.departmentName)
    .filter((row) => !departmentNeedle || row.departmentName.trim().toLowerCase() === departmentNeedle)
    .filter((row) => includeInactive || row.isActive);

  const deduped = new Map<string, DoctorRow>();
  normalized.forEach((row) => {
    const key = doctorKey(row.doctorName, row.departmentName);
    if (!deduped.has(key)) deduped.set(key, row);
  });

  return Array.from(deduped.values()).sort((a, b) => a.doctorName.localeCompare(b.doctorName));
}

export async function listDoctors(filters: { departmentName?: string; includeInactive?: boolean } = {}): Promise<DoctorRow[]> {
  const cacheKey = getCacheKey(filters);

  try {
    return await listDoctorsFromHr(filters);
  } catch {
    const query = new URLSearchParams();
    if (filters.departmentName?.trim()) query.set('department', filters.departmentName.trim());
    if (filters.includeInactive) query.set('include_inactive', 'true');
    const suffix = query.toString();
    const rows = await fetchApiData<Array<Record<string, unknown>>>(`${resolveApiUrl()}${suffix ? `?${suffix}` : ''}`, {
      ttlMs: 30_000,
      cacheKey: `doctors:${cacheKey}`
    });
    return (Array.isArray(rows) ? rows : []).map(normalizeDoctorRow);
  }
}

export async function upsertDoctor(payload: {
  doctorName: string;
  departmentName: string;
  specialization?: string;
  isActive?: boolean;
  actor?: string;
}): Promise<DoctorRow> {
  const data = await fetchApiData<Record<string, unknown>>(resolveApiUrl(), {
    method: 'POST',
    body: {
      action: 'upsert',
      actor: payload.actor || 'Admin',
      doctor_name: payload.doctorName,
      department_name: payload.departmentName,
      specialization: payload.specialization || '',
      is_active: payload.isActive == null ? true : payload.isActive
    }
  });
  invalidateApiCache('doctors:');
  invalidateApiCache('/api/doctor-availability');
  const saved = normalizeDoctorRow(data);
  emitRealtimeRefresh('doctor_upserted');
  return saved;
}
