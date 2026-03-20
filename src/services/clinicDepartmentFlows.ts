import { dispatchDepartmentFlow, getFlowEventStatus, type FlowEventStatus } from '@/services/departmentIntegration';

type TrackedClinicDispatch<T> = FlowEventStatus & {
  payload?: T;
};

async function trackClinicDispatch<T>(
  targetDepartment: 'cashier' | 'guidance' | 'pmed',
  eventCode: string,
  payload: Record<string, unknown>,
  sourceRecordId: string | undefined,
  attachment: T,
  fallbackMessage: string
): Promise<TrackedClinicDispatch<T>> {
  const result = await dispatchDepartmentFlow('clinic', targetDepartment, eventCode, payload, sourceRecordId);

  if (result.ok && result.correlation_id) {
    const status = await getFlowEventStatus(undefined, result.correlation_id);
    return {
      ...status,
      payload: attachment
    };
  }

  return {
    ok: false,
    last_error: result.message || fallbackMessage,
    payload: attachment
  };
}

export type ClinicMedicalFeeAssessment = {
  patient_id: string;
  patient_name: string;
  amount_due: number;
  service_type?: string;
  reference_no?: string;
  remarks?: string;
};

export async function dispatchMedicalFeeAssessmentToCashier(
  assessment: ClinicMedicalFeeAssessment,
  sourceRecordId?: string
): Promise<TrackedClinicDispatch<ClinicMedicalFeeAssessment>> {
  return await trackClinicDispatch(
    'cashier',
    'medical_fee_assessment',
    {
      patient_id: assessment.patient_id,
      patient_name: assessment.patient_name,
      amount_due: assessment.amount_due,
      service_type: assessment.service_type,
      reference_no: assessment.reference_no,
      remarks: assessment.remarks
    },
    sourceRecordId,
    assessment,
    'Failed to dispatch medical fee assessment to Cashier.'
  );
}

export type ClinicHealthReport = {
  student_id: string;
  student_name: string;
  summary: string;
  visit_reference?: string;
  recommendation?: string;
};

export async function dispatchHealthReportToGuidance(
  report: ClinicHealthReport,
  sourceRecordId?: string
): Promise<TrackedClinicDispatch<ClinicHealthReport>> {
  return await trackClinicDispatch(
    'guidance',
    'health_reports',
    {
      student_id: report.student_id,
      student_name: report.student_name,
      summary: report.summary,
      visit_reference: report.visit_reference,
      recommendation: report.recommendation
    },
    sourceRecordId,
    report,
    'Failed to dispatch health report to Guidance.'
  );
}

export type ClinicMedicalServiceReport = {
  report_period: string;
  service_count: number;
  clearance_summary?: string;
  visit_summary?: string;
};

export async function dispatchMedicalServiceReportToPmed(
  report: ClinicMedicalServiceReport,
  sourceRecordId?: string
): Promise<TrackedClinicDispatch<ClinicMedicalServiceReport>> {
  return await trackClinicDispatch(
    'pmed',
    'medical_service_reports',
    {
      report_period: report.report_period,
      service_count: report.service_count,
      clearance_summary: report.clearance_summary,
      visit_summary: report.visit_summary
    },
    sourceRecordId,
    report,
    'Failed to dispatch medical service report to PMED.'
  );
}
