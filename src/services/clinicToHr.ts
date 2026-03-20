import { dispatchDepartmentFlow, getFlowEventStatus, type FlowEventStatus } from '@/services/departmentIntegration';

export type OccupationalHealthReport = {
  employee_id: string;
  employee_name: string;
  clearance_status: 'fit' | 'unfit' | 'conditional' | 'pending';
  fitness_level?: string;
  restrictions?: string;
  next_evaluation_date?: string;
  report_date?: string;
  notes?: string;
};

export type DispatchOccupationalHealthResult = FlowEventStatus & {
  report?: OccupationalHealthReport;
};

export async function dispatchOccupationalHealthReportToHR(
  report: OccupationalHealthReport,
  sourceRecordId?: string
): Promise<FlowEventStatus> {
  const payload: Record<string, unknown> = {
    employee_id: report.employee_id,
    employee_name: report.employee_name,
    clearance_status: report.clearance_status,
    fitness_level: report.fitness_level,
    restrictions: report.restrictions,
    next_evaluation_date: report.next_evaluation_date,
    report_date: report.report_date || new Date().toISOString(),
    notes: report.notes
  };

  const result = await dispatchDepartmentFlow(
    'clinic',
    'hr',
    'occupational_health_reports',
    payload,
    sourceRecordId
  );

  if (result.ok && result.correlation_id) {
    return await getFlowEventStatus(undefined, result.correlation_id);
  }

  return {
    ok: false,
    last_error: result.message || 'Failed to dispatch occupational health report'
  } as FlowEventStatus;
}

export async function dispatchStaffFitnessClearance(
  employeeId: string,
  employeeName: string,
  clearanceStatus: OccupationalHealthReport['clearance_status'],
  additionalData: Partial<OccupationalHealthReport> = {}
): Promise<FlowEventStatus> {
  return dispatchOccupationalHealthReportToHR({
    employee_id: employeeId,
    employee_name: employeeName,
    clearance_status: clearanceStatus,
    ...additionalData
  });
}
