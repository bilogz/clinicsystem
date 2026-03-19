# Supabase Seed Setup

Supabase prep files are now available in `database/supabase/` and `docs/supabase-preparation.md`.

The current runtime still uses the existing API path, but the seed bundles below are now PostgreSQL/Supabase compatible.

## 1. Create the schema

Preferred (aligned to `supabase/integration-merge/`):

```powershell
psql "$env:DATABASE_URL" -f supabase/schema.sql
```

Legacy bundle (kept for reference/back-compat):

```powershell
psql "$env:DATABASE_URL" -f database/supabase/all_modules_seed.sql
```

## 2. Load Supabase seed data

Preferred:

```powershell
psql "$env:DATABASE_URL" -f supabase/seed.sql
```

Legacy bundle:

```powershell
psql "$env:DATABASE_URL" -f database/supabase/all_tables_seed.sql
```

If you want the cashier mock records too, run:

```powershell
psql "$env:DATABASE_URL" -f database/supabase/clinic_cashier_mock_appointments.sql
```

These seed bundles cover the legacy extras that are not already included in the PostgreSQL module seeds:

- `admin_activity_logs`
- `admin_sessions`
- `cashier_integration_events`
- `cashier_payment_links`
- `department_clearance_records`

## 3. Update `.env`

```env
DB_CLIENT=postgres
DATABASE_URL=postgresql://postgres:your-password@db.YOUR-PROJECT.supabase.co:5432/postgres
CASHIER_INTEGRATION_ENABLED=true
CASHIER_SYSTEM_BASE_URL=supabase://internal
CASHIER_SHARED_TOKEN=
CASHIER_SYNC_MODE=auto
CASHIER_SYSTEM_INBOUND_PATH=/api/integrations/cashier/payment-status
```

## 4. Restart the dev server

```powershell
npm run dev
```

## Notes

- Frontend stack stays the same.
- API routes stay the same.
- The default admin seed is `joecelgarcia1@gmail.com / Admin#123`.
- The Supabase seed files are idempotent, so they can be re-run safely for local refreshes.
- Cashier integration can run fully inside Supabase with `CASHIER_SYSTEM_BASE_URL=supabase://internal`.
- In Supabase-internal mode, clinic, cashier, patient sync, and department clearance all share the same billing state without a localhost bridge.
- The old seed folder is legacy-only and should not be used for new work.

## Cashier Integration Endpoints

These endpoints are now available for cashier-system integration:

```text
GET  /api/integrations/cashier/status
GET  /api/integrations/cashier/queue
POST /api/integrations/cashier/sync
POST /api/integrations/cashier/payment-status
```

Typical usage:

1. Use `CASHIER_SYSTEM_BASE_URL=supabase://internal` and `CASHIER_SYNC_MODE=auto` for shared Supabase live sync.
2. Let the clinic system enqueue appointment, laboratory, and pharmacy billing events.
3. The app will dispatch and acknowledge those records against the shared Supabase cashier tables automatically.
4. Send payment updates back through `/api/integrations/cashier/payment-status` when you need to change settlement state from the UI or another trusted service.
