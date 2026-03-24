import { fetchApiData, invalidateApiCache } from '@/services/apiClient';

export type HealthReportSeverity = 'low' | 'moderate' | 'high' | 'emergency';
export type HealthReportStudentType = 'student' | 'teacher' | 'unknown';

export type MedicineEntry = {
  name: string;
  dose?: string;
  quantity?: string;
  notes?: string;
};

export type ClinicHealthReport = {
  id: number;
  reportCode: string;
  studentId: string;
  studentName: string;
  studentType: HealthReportStudentType;
  gradeSection: string;
  age: number | null;
  sex: string;
  healthIssue: string;
  symptoms: string;
  severity: HealthReportSeverity;
  treatmentGiven: string;
  medicinesUsed: MedicineEntry[];
  firstAidGiven: string;
  attendingStaff: string;
  remarks: string;
  sentToPmed: boolean;
  pmedSentAt: string | null;
  pmedEntityKey: string;
  createdAt: string;
  updatedAt: string;
};

export type HealthReportListPayload = {
  items: ClinicHealthReport[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
};

export type CreateHealthReportInput = {
  studentId?: string;
  studentName: string;
  studentType?: HealthReportStudentType;
  gradeSection?: string;
  age?: number | null;
  sex?: string;
  healthIssue: string;
  symptoms?: string;
  severity?: HealthReportSeverity;
  treatmentGiven?: string;
  medicinesUsed?: MedicineEntry[];
  firstAidGiven?: string;
  attendingStaff?: string;
  remarks?: string;
  actor?: string;
};

export type HealthReportCreateResult = {
  reportCode: string;
  entityKey: string;
  studentName: string;
  severity: HealthReportSeverity;
  sentToPmed: boolean;
  createdAt: string;
};

const BASE = '/api/health-reports';

export async function fetchHealthReports(
  query: {
    search?: string;
    sentToPmed?: boolean | null;
    severity?: HealthReportSeverity;
    page?: number;
    perPage?: number;
    forceRefresh?: boolean;
  } = {}
): Promise<HealthReportListPayload> {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.sentToPmed === true) params.set('sent_to_pmed', '1');
  if (query.sentToPmed === false) params.set('sent_to_pmed', '0');
  if (query.severity) params.set('severity', query.severity);
  if (query.page) params.set('page', String(query.page));
  if (query.perPage) params.set('per_page', String(query.perPage));
  const url = `${BASE}${params.toString() ? `?${params.toString()}` : ''}`;
  const result = await fetchApiData<{ ok: boolean; data: HealthReportListPayload }>(url, {
    ttlMs: 5_000,
    forceRefresh: query.forceRefresh
  });
  return (result as any)?.data ?? result;
}

export async function createAndSendHealthReport(
  input: CreateHealthReportInput
): Promise<HealthReportCreateResult> {
  const result = await fetchApiData<{ ok: boolean; data: HealthReportCreateResult }>(BASE, {
    method: 'POST',
    body: {
      action: 'send_to_pmed',
      student_id: input.studentId || '',
      student_name: input.studentName,
      student_type: input.studentType || 'student',
      grade_section: input.gradeSection || '',
      age: input.age ?? null,
      sex: input.sex || '',
      health_issue: input.healthIssue,
      symptoms: input.symptoms || '',
      severity: input.severity || 'low',
      treatment_given: input.treatmentGiven || '',
      medicines_used: input.medicinesUsed || [],
      first_aid_given: input.firstAidGiven || '',
      attending_staff: input.attendingStaff || '',
      remarks: input.remarks || '',
      actor: input.actor || input.attendingStaff || 'Clinic Staff'
    }
  });
  invalidateApiCache(BASE);
  invalidateApiCache('/api/reports');
  invalidateApiCache('/api/module-activity');
  return (result as any)?.data ?? result;
}
