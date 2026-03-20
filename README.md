# Cashier System Clone-to-Test Guide

This guide covers the full local setup flow for the `cashier-system` project on Windows, from cloning the repository to testing the cashier workflow and Supabase-backed clinic integration.

## What you need

- `Git`
- `Node.js` and `npm`
- A Supabase project (PostgreSQL)
- PowerShell or VS Code terminal

## 1. Clone the repository

```powershell
git clone <your-repository-url> cashier-system
cd cashier-system
```

If you already have the project folder, just open:

```

## 2. Install dependencies

```powershell
npm install
```

## 3. Create the database

This project now targets Supabase (PostgreSQL) only.

1) In Supabase SQL editor, run:

- `supabase/schema.sql`
- `supabase/seed.sql`
- Existing clinic databases should also run `supabase/migrations/20260320194500_prepare_clinic_hr_integration.sql` before connecting the HR app.

2) Configure `.env` (see `.env.example`) using `DATABASE_URL`.

## 4. Configure the backend

The project root should contain `.env.server`.

Recommended contents:

```env
API_PORT=3001
FRONTEND_ORIGIN=http://localhost:5173,http://localhost:5174

DATABASE_URL=postgresql://postgres:your-password@db.your-project-ref.supabase.co:5432/postgres?sslmode=require
CASHIER_INTEGRATION_ENABLED=true
CASHIER_SYSTEM_BASE_URL=supabase://internal
CASHIER_SYNC_MODE=auto
CASHIER_SYSTEM_INBOUND_PATH=/api/integrations/cashier/payment-status
CASHIER_SHARED_TOKEN=
DEPARTMENT_INTEGRATION_SHARED_TOKEN=

SEED_ADMIN_USERNAME=admin@cashier.local
SEED_ADMIN_PASSWORD=admin123
```

You can also copy from:

```text
server/.env.example
```

## 5. Configure the frontend

The root `.env` should contain:

```env
VITE_API_BASE_URL=http://localhost:3001/api
```

## 6. Verify database connection

Before running the app, check the connection:

```powershell
npm run db:ping
```

Expected result:

```text
PostgreSQL connection successful.
```

## 7. Start the cashier backend

Open a terminal in the project root:

```powershell
npm run server:dev
```

Keep this terminal open.

Test the backend:

```text
http://localhost:3001/api/health
```

Do not use just `http://localhost:3001` because the API health route is under `/api/health`.

## 8. Start the cashier frontend

Open a second terminal:

```powershell
npm run dev
```

Open the URL printed by Vite, usually:

- `http://localhost:5174`
- or `http://localhost:5173`

## 10. Default accounts

Use these seeded clinic admin credentials:

- Super Admin: `joecelgarcia1@gmail.com` / `Admin#123`
- Appointments: `appointments.admin@nexora.local` / `Admin#123`
- Registration: `registration.admin@nexora.local` / `Admin#123`
- Laboratory: `lab.admin@nexora.local` / `Admin#123`
- Reports: `reports.admin@nexora.local` / `Admin#123`

## 11. What to test first

After login, test the main BPA flow:

1. `Student Portal & Billing`
2. `Pay Bills`
3. `Payment Processing & Gateway`
4. `Compliance & Documentation`
5. `Completed Transactions`

You can use the seeded demo records to test:

- verify billing
- approve payment
- installment setup
- authorize transaction
- confirm paid
- generate receipt
- verify proof
- complete documentation
- reconcile/archive

## 12. Optional clinic integration setup

If you are also using the separate `clinicsystem` project:

### Clinic project expected path

```text
C:\Users\Bilog\Projects\clinicsystem
```

### Important note

The clinic project must point to a real cashier backend URL. If the clinic `.env` contains:

```env
CASHIER_SYSTEM_BASE_URL=http://127.0.0.1:8091
```

and nothing is running there, the clinic app will show:

```text
connect ETIMEDOUT
```

Use the cashier backend instead:

```env
CASHIER_SYSTEM_BASE_URL=http://localhost:3001
```

or disable clinic integration temporarily:

```env
CASHIER_INTEGRATION_ENABLED=false
```

Then restart the clinic dev server.

## 13. Testing clinic-linked records in cashier

The seeded cashier demo includes clinic-origin mock records.

To see them:

1. run `npm run db:seed`
2. run `npm run server:dev`
3. hard refresh the cashier frontend
4. open:

```text
/modules/billing-verification
```

Clinic-linked records are labeled in the billing queue and should move through the workflow just like normal cashier records.

## 14. Typical daily startup order

Use this order every time:

1. Ensure `DATABASE_URL` is configured (Supabase/PostgreSQL)
2. Run:

open project

3. In another terminal:

```powershell
cd C:\Users\Bilog\Projects\cashier-system
npm run dev
```

4. Open the frontend URL

## 15. Common errors

### `ERR_CONNECTION_REFUSED` on `localhost:3001`

The backend is not running.

Run:

```powershell
npm run server:dev
```

Then test:

```text
http://localhost:3001/api/health
```

### `connect ETIMEDOUT`

Usually means:

- the clinic app is trying to call a cashier URL that is not running
- or the backend URL in `.env` is wrong

Check the clinic `.env` and make sure `CASHIER_SYSTEM_BASE_URL` points to a live cashier backend.

### `Failed to fetch`

Usually means:

- backend not running
- wrong `VITE_API_BASE_URL`
- CORS mismatch

Make sure:

- cashier backend is running on `3001`
- frontend uses `VITE_API_BASE_URL=http://localhost:3001/api`

### Login page loads but cannot sign in

Check:

1. `npm run db:ping`
2. `http://localhost:3001/api/health`
3. `npm run server:dev`
4. that the database was imported or seeded

## 16. Useful commands

```powershell
npm install
npm run db:ping
npm run db:seed
npm run server:dev
npm run dev
npm run build
```

## 17. Related docs

- [local-development-setup.md](/C:/Users/Bilog/Projects/cashier-system/docs/local-development-setup.md)
- [php-integration-setup.md](/C:/Users/Bilog/Projects/cashier-system/docs/php-integration-setup.md)
