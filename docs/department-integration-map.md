# Department Integration Map

This clinic system now uses a database-first integration model backed by Supabase.

## Shared API

The clinic app exposes:

- `GET /api/integrations/departments/map`
- `GET /api/integrations/departments/records`
- `POST /api/integrations/departments/records`
- `GET /api/integrations/departments/report?department=pmed`
- `POST /api/integrations/departments/report`

## Shared Database Tables

- `clinic.department_flow_profiles`
- `clinic.department_clearance_records`
- `clinic.cashier_integration_events`
- `clinic.cashier_payment_links`
- `public.module_activity_logs`

## Department Roles

### Registrar

- Receives payment confirmation, medical clearance, counseling reports, discipline records, and activity participation records.
- Sends student enrollment data, student personal information, student academic records, student list, and enrollment statistics.

### Cashier

- Receives student enrollment data and payroll data.
- Sends payment confirmation and financial reports.

### Clinic

- Receives student personal information and incident reports.
- Sends medical clearance, health reports, and health service reports.

### Guidance

- Receives student personal information and student academic records.
- Sends counseling reports, health concerns, discipline reports, and student recommendations.

### Prefect

- Receives student personal information.
- Sends discipline records, discipline reports, incident reports, and discipline statistics.

### Computer Laboratory

- Receives student list and staff list.
- Sends laboratory usage reports.

### CRAD

- Receives student list and student recommendations.
- Sends activity participation records and program activity reports.

### HR

- Receives staff evaluation feedback.
- Sends payroll data, staff list, and employee performance records.

### PMED

- Receives enrollment statistics, financial reports, health service reports, counseling reports, discipline statistics, laboratory usage reports, program activity reports, and employee performance records.
- Sends evaluation reports to School Administration and staff evaluation feedback to HR.

## PMED Reporting

PMED is the consolidated reporting hub.

- Use `GET /api/integrations/departments/report?department=pmed` to fetch the current PMED report package.
- Use `POST /api/integrations/departments/report` with `action=dispatch_report` to record outbound report dispatches.

Example payload:

```json
{
  "action": "dispatch_report",
  "department_key": "pmed",
  "target_key": "school_admin",
  "report_type": "evaluation_reports"
}
```

## Source Of Truth

- `supabase/seed.sql` owns the standardized department flow profile data.
- Department-specific merge scripts should not redefine flow order.
