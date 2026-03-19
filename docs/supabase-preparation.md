# Supabase Preparation

This repo now uses Supabase PostgreSQL as the shared integration database.

## What Is Ready

- A shared Supabase schema for the BPM flow.
- A department flow profile table that stores the current receive/send matrix.
- Runtime APIs read and write against the shared database contract.

## Flow Contract

The table below reflects the handoff list you provided.

`flow_order` matches the handoff order in your notes.
`clearance_stage_order` matches the current clinic approval order used by the existing runtime.

| Department | Receives | Sends |
| --- | --- | --- |
| Registrar | Payment confirmation, medical clearance, counseling reports, discipline records, activity participation records | Student enrollment data to Cashier; student personal information to Clinic, Guidance, and Prefect; student list to Computer Laboratory and CRAD; enrollment statistics to PMED |
| Cashier | Student enrollment data, payroll data | Payment confirmation to Registrar; financial reports to PMED |
| Clinic | Student personal information, health incident reports | Medical clearance to Registrar; health reports to Guidance; health service reports to PMED |
| Guidance Office | Student personal information, student academic records | Counseling reports to Registrar; counseling reports to PMED; health concerns to Clinic; discipline reports to Prefect; student recommendations to CRAD |
| Prefect Office | Student personal information | Discipline records to Registrar; discipline reports to Guidance; incident reports to Clinic; discipline statistics to PMED |
| Computer Laboratory | Student list, staff list | Laboratory usage reports to PMED |
| CRAD Department | Student list, student recommendations | Activity participation records to Registrar; program activity reports to PMED |
| HR Department | Staff evaluation feedback | Payroll data to Cashier; staff list to Registrar and Computer Laboratory; employee performance records to PMED |
| PMED Department | Enrollment statistics, financial reports, health service reports, counseling reports, discipline statistics, laboratory usage reports, program activity reports, employee performance reports | Evaluation reports to School Administration; staff evaluation feedback to HR |

## Supabase Schema File

- Schema to run: `supabase/schema.sql`
- Flow/profile seed to run: `supabase/seed.sql`
- Existing data cleanup when needed: `supabase/patient_type_student_teacher_fix.sql`

## Runtime Notes

- `supabase/schema.sql` creates the shared tables and constraints.
- `supabase/seed.sql` is the source of truth for department flow profiles.
- Department integrations should use the app API and shared Supabase tables directly.
