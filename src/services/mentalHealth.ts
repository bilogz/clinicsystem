import { fetchApiData, invalidateApiCache } from '@/services/apiClient';

export type MentalHealthStatus = 'create' | 'active' | 'follow_up' | 'at_risk' | 'completed' | 'escalated' | 'archived';

export type MentalHealthRisk = 'low' | 'medium' | 'high';

export type MentalHealthPatient = {
  patient_id: string;
  patient_name: string;
  patient_type: 'student' | 'teacher' | 'unknown';
  previous_sessions: number;
  latest_case_reference: string | null;
};

export type MentalHealthSession = {
  id: number;
  case_reference: string;
  patient_id: string;
  patient_name: string;
  patient_type: 'student' | 'teacher' | 'unknown';
  counselor: string;
  session_type: string;
  status: MentalHealthStatus;
  risk_level: MentalHealthRisk;
  diagnosis_condition: string;
  treatment_plan: string;
  session_goals: string;
  session_duration_minutes: number;
  session_mode: 'in_person' | 'online';
  location_room: string;
  guardian_contact: string;
  emergency_contact: string;
  medication_reference: string;
  follow_up_frequency: string;
  escalation_reason: string;
  outcome_result: string;
  assessment_score: number | null;
  assessment_tool: string;
  appointment_at: string;
  next_follow_up_at: string | null;
  created_by_role: string;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
};

export type MentalHealthNote = {
  id: number;
  session_id: number;
  note_type: string;
  note_content: string;
  clinical_score: number | null;
  attachment_name: string;
  attachment_url: string;
  created_by_role: string;
  created_at: string;
};

export type MentalHealthActivity = {
  id: number;
  session_id: number;
  action: string;
  detail: string;
  actor_role: string;
  created_at: string;
};

export type MentalHealthSnapshot = {
  sessions: MentalHealthSession[];
  patients: MentalHealthPatient[];
  notes: MentalHealthNote[];
  activities: MentalHealthActivity[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
  analytics: {
    active: number;
    follow_up: number;
    at_risk: number;
    completed: number;
    escalated: number;
    archived: number;
  };
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveApiUrl(): string {
  const directApi = import.meta.env.VITE_MENTAL_HEALTH_API_URL?.trim();
  if (directApi) return trimTrailingSlashes(directApi);
  const configured = import.meta.env.VITE_BACKEND_API_BASE_URL?.trim();
  if (configured) return `${trimTrailingSlashes(configured)}/mental-health`;
  return '/api/mental-health';
}

export async function fetchMentalHealthSnapshot(): Promise<MentalHealthSnapshot> {
  return await fetchMentalHealthSnapshotWithQuery();
}

export async function fetchMentalHealthSnapshotWithQuery(filters: {
  search?: string;
  status?: string;
  risk?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<MentalHealthSnapshot> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.risk) params.set('risk', filters.risk);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.perPage) params.set('per_page', String(filters.perPage));
  const suffix = params.toString();
  const url = suffix ? `${resolveApiUrl()}?${suffix}` : resolveApiUrl();
  const data = await fetchApiData<Partial<MentalHealthSnapshot>>(url, { ttlMs: 10_000 });
  return {
    sessions: data.sessions || [],
    patients: data.patients || [],
    notes: data.notes || [],
    activities: data.activities || [],
    meta: data.meta || { page: filters.page || 1, perPage: filters.perPage || 8, total: 0, totalPages: 1 },
    analytics: data.analytics || { active: 0, follow_up: 0, at_risk: 0, completed: 0, escalated: 0, archived: 0 }
  };
}

export async function dispatchMentalHealthAction(payload: Record<string, unknown>): Promise<void> {
  await fetchApiData<unknown>(resolveApiUrl(), {
    method: 'POST',
    body: payload
  });
  invalidateApiCache('/api/mental-health');
  invalidateApiCache('/api/dashboard');
  invalidateApiCache('/api/reports');
  invalidateApiCache('/api/patients');
}
