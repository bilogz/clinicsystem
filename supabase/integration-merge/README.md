# Department Integration Merge Scripts

These scripts layer the shared BPM integration contract on top of the per-department schemas.

Run order:
1. `01-clinic.sql`
2. Any department files you want to expose to the shared integration tables

What each script does:
- `01-clinic.sql`: creates the clinic-owned shared integration tables and upserts the clinic flow profile
- all other department files: create schema-local views pointing to `clinic.*` integration tables and upsert that department's flow profile

Shared integration objects exposed to each department:
- `department_flow_profiles`
- `department_clearance_records`
- `cashier_integration_events`
- `cashier_payment_links`
- `clinic_cashier_sync_logs`
- `clinic_cashier_audit_logs`
