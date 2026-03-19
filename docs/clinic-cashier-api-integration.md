# Clinic to Cashier Integration

This project now uses a database-first cashier integration through the shared Supabase database.

## Core Tables

- `clinic.cashier_integration_events`
- `clinic.cashier_payment_links`
- `public.patient_appointments`
- `public.module_activity_logs`

## Flow

1. Clinic creates or updates a billable appointment or related service record.
2. The app records an event in `clinic.cashier_integration_events`.
3. Cashier status is stored in `clinic.cashier_payment_links`.
4. The clinic app syncs payment state back into source records such as `public.patient_appointments`.
5. Department clearance and PMED reports read the same shared data.

## Runtime Endpoints

- `GET /api/integrations/cashier/status`
- `GET /api/integrations/cashier/queue`
- `POST /api/integrations/cashier/sync`
- `POST /api/integrations/cashier/payment-status`

## Environment

Use Supabase internal mode in `.env`:

```env
CASHIER_INTEGRATION_ENABLED=true
CASHIER_SYSTEM_BASE_URL=supabase://internal
CASHIER_SYNC_MODE=auto
CASHIER_SYSTEM_INBOUND_PATH=/api/integrations/cashier/payment-status
```

## Notes

- No PHP bridge or callback endpoint is required.
- The shared Supabase database is the integration source of truth.
