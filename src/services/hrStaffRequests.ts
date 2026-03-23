import { fetchApiData, invalidateApiCache } from '@/services/apiClient';

export type HrStaffDirectoryRow = {
  id: number;
  employee_no: string;
  full_name: string;
  role_type: 'doctor' | 'nurse';
  department_name: string;
  employment_status: 'active' | 'working' | 'inactive';
  contact_email: string | null;
  contact_phone: string | null;
  hired_at: string | null;
  updated_at: string;
};

export type HrStaffRequestRow = {
  id: number;
  request_reference: string;
  staff_id: number;
  employee_no: string;
  staff_name: string;
  role_type: 'doctor' | 'nurse';
  department_name: string;
  request_status: 'pending' | 'approved' | 'rejected' | 'queue' | 'waiting_applicant' | 'hiring' | 'hired';
  request_notes: string | null;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HrStaffRequestStatus = {
  totals: {
    activeRoster: number;
    workingRoster: number;
    pendingRequests: number;
    approvedRequests: number;
  };
  recentRequests: HrStaffRequestRow[];
};

type Meta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

type PagedResult<T> = {
  items: T[];
  meta: Meta;
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveBaseUrl(): string {
  const directApi = import.meta.env.VITE_HR_STAFF_INTEGRATION_API_URL?.trim();
  if (directApi) return trimTrailingSlashes(directApi);
  const configured = import.meta.env.VITE_BACKEND_API_BASE_URL?.trim();
  if (configured) return `${trimTrailingSlashes(configured)}/integrations/hr-staff`;
  return '/api/integrations/hr-staff';
}

function withQuery(url: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `${url}?${suffix}` : url;
}

export async function fetchHrStaffRequestStatus(): Promise<HrStaffRequestStatus> {
  return await fetchApiData<HrStaffRequestStatus>(`${resolveBaseUrl()}/status`, { ttlMs: 5_000 });
}

export async function fetchHrStaffRequests(params: {
  search?: string;
  status?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<PagedResult<HrStaffRequestRow>> {
  return await fetchApiData<PagedResult<HrStaffRequestRow>>(
    withQuery(`${resolveBaseUrl()}/requests`, {
      search: params.search,
      status: params.status,
      page: params.page,
      per_page: params.perPage
    }),
    { ttlMs: 3_000 }
  );
}

export async function fetchHrStaffDirectory(params: {
  search?: string;
  role?: string;
  employmentStatus?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<PagedResult<HrStaffDirectoryRow>> {
  return await fetchApiData<PagedResult<HrStaffDirectoryRow>>(
    withQuery(`${resolveBaseUrl()}/directory`, {
      search: params.search,
      role: params.role,
      employment_status: params.employmentStatus,
      page: params.page,
      per_page: params.perPage
    }),
    { ttlMs: 3_000 }
  );
}

export async function createHrStaffRequest(payload: {
  staffId?: number;
  roleType?: 'doctor' | 'nurse';
  requestedCount?: number;
  requestedBy?: string;
  requestNotes?: string;
}): Promise<void> {
  await fetchApiData<unknown>(`${resolveBaseUrl()}/requests`, {
    method: 'POST',
    body: {
      staff_id: payload.staffId,
      role_type: payload.roleType,
      requested_count: payload.requestedCount,
      requested_by: payload.requestedBy,
      request_notes: payload.requestNotes
    }
  });
  invalidateApiCache('/api/integrations/hr-staff');
}

export async function updateHrStaffRequestStatus(payload: {
  id: number;
  requestStatus: 'pending' | 'approved' | 'rejected' | 'queue' | 'waiting_applicant' | 'hiring' | 'hired';
  decidedBy?: string;
}): Promise<void> {
  await fetchApiData<unknown>(`${resolveBaseUrl()}/requests`, {
    method: 'PATCH',
    body: {
      id: payload.id,
      request_status: payload.requestStatus,
      decided_by: payload.decidedBy
    }
  });
  invalidateApiCache('/api/integrations/hr-staff');
}
