# Vercel Deployment

This project can run as a single Vercel deployment:

- Vue/Vite frontend from `dist`
- Node API from `api/[...path].ts`

That means the frontend and backend share the same origin, so existing `/api/...` requests work in deployed mode without `VITE_BACKEND_API_BASE_URL`.

## 1. Import the repo into Vercel

Create a new Vercel project from this repository.

Use these settings:

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

The repo also includes [vercel.json](/C:/xampp/htdocs/bpm commision/clinicsystem/vercel.json) with the same output directory and SPA rewrite.

## 2. Add environment variables in Vercel

Required:

- `DATABASE_URL`

Recommended if used by your app:

- `CASHIER_INTEGRATION_ENABLED=true`
- `CASHIER_SYSTEM_BASE_URL`
- `CASHIER_SYNC_MODE=auto`
- `CASHIER_SYSTEM_INBOUND_PATH=/api/integrations/cashier/payment-status`
- `CASHIER_SHARED_TOKEN`
- `DEPARTMENT_INTEGRATION_SHARED_TOKEN`

## 3. Why this works better than Netlify + external API

The frontend and API are served by the same Vercel project, so:

- `/api/admin-auth`
- `/api/dashboard`
- `/api/appointments`

stay on the same domain as the app.

That avoids:

- HTML instead of JSON from SPA fallback
- cross-origin cookie issues
- separate backend host wiring

## 4. Health check

After deploy, open:

```text
https://your-project.vercel.app/api/health
```

It should return JSON.

## 5. Admin login

Open:

```text
https://your-project.vercel.app/admin/login
```

If `DATABASE_URL` is correct and your Supabase/Postgres tables are available, login should use the live backend.
