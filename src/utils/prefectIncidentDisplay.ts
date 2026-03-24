import type { ModuleActivityItem } from '@/services/moduleActivity';

export type PrefectIncidentView = {
  id: number;
  created_at: string;
  title: string;
  studentNo: string;
  studentName: string;
  referenceNo: string;
  severity: string;
  location: string;
  status: string;
  incidentType: string;
  incidentDate: string;
  reportedBy: string;
  detail: string;
  narrative: string;
  correlationId: string;
  entityKey: string | null;
  raw: ModuleActivityItem;
};

function str(v: unknown): string {
  if (v == null) return '';
  const t = String(v).trim();
  return t || '';
}

function metaRecord(meta: Record<string, unknown>): Record<string, unknown> {
  const inc = meta.incident;
  if (inc && typeof inc === 'object' && !Array.isArray(inc)) {
    return inc as Record<string, unknown>;
  }
  return {};
}

function payloadRecord(meta: Record<string, unknown>): Record<string, unknown> {
  const p = meta.payload;
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    return p as Record<string, unknown>;
  }
  return {};
}

/** Map a module_activity row (prefect_incident) to a stable UI model. */
export function rowToPrefectIncidentView(row: ModuleActivityItem): PrefectIncidentView {
  const meta = (row.metadata || {}) as Record<string, unknown>;
  const inc = metaRecord(meta);
  const pay = payloadRecord(meta);

  const title =
    str(inc.title) ||
    str(inc.incident_type) ||
    str(pay.title) ||
    str(pay.incident_type) ||
    str(pay.subject) ||
    'Prefect incident report';

  const studentNo =
    str(inc.student_no) || str(inc.patient_code) || str(pay.student_no) || str(pay.studentNo) || str(pay.patient_code);

  const studentName =
    str(inc.student_name) ||
    str(inc.patient_name) ||
    str(pay.student_name) ||
    str(pay.patient_name) ||
    str(pay.name);

  const referenceNo =
    str(inc.reference_no) ||
    str(inc.clearance_reference) ||
    str(pay.reference_no) ||
    str(pay.clearance_reference) ||
    str(meta.clearance_reference);

  const severity = str(inc.severity) || str(pay.severity) || str(pay.priority) || str(pay.risk_level);
  const location = str(inc.location) || str(pay.location) || str(pay.campus_location) || str(pay.venue);
  const status = str(inc.status) || str(pay.status) || str(pay.state);
  const incidentType = str(inc.incident_type) || str(inc.type) || str(pay.incident_type) || str(pay.type) || str(pay.category);
  const incidentDate = str(inc.incident_date) || str(pay.incident_date) || str(pay.date_occurred) || str(pay.occurred_at);
  const reportedBy = str(inc.reported_by) || str(inc.reportedBy) || str(pay.reported_by) || str(pay.requested_by);

  const narrativeParts = [
    str(inc.notes),
    str(inc.description),
    str(inc.remarks),
    str(inc.action_taken),
    str(pay.notes),
    str(pay.incident_summary),
    str(pay.description)
  ].filter(Boolean);

  const narrative = narrativeParts.length ? [...new Set(narrativeParts)].join('\n\n') : '';

  const correlationId = str(meta.correlation_id);

  return {
    id: row.id,
    created_at: row.created_at,
    title,
    studentNo,
    studentName,
    referenceNo,
    severity,
    location,
    status,
    incidentType,
    incidentDate,
    reportedBy,
    detail: row.detail,
    narrative,
    correlationId,
    entityKey: row.entity_key,
    raw: row
  };
}

export function severityChipColor(severity: string): string {
  const s = severity.toLowerCase();
  if (s.includes('critical') || s.includes('high') || s.includes('emergency')) return 'error';
  if (s.includes('medium') || s.includes('moderate')) return 'warning';
  if (s.includes('low') || s.includes('minor')) return 'success';
  return 'grey';
}
