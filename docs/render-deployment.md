# Render Deployment

This project now supports a standalone API deployment on Render while the Vue frontend stays on Netlify.

## 1. Deploy the backend to Render

Create a new Web Service from this repo.

Use these settings:

- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm run server:start`

The repo also includes [render.yaml](/C:/xampp/htdocs/bpm commision/clinicsystem/render.yaml) if you want to use Render Blueprint setup.

## 2. Required Render environment variables

Add these in Render:

- `DATABASE_URL`
- `FRONTEND_ORIGIN=https://nimble-platypus-f26709.netlify.app`

Optional or integration-related variables:

- `DEPARTMENT_INTEGRATION_SHARED_TOKEN`
- `CASHIER_INTEGRATION_ENABLED=true`
- `CASHIER_SYSTEM_BASE_URL`
- `CASHIER_SYNC_MODE=auto`
- `CASHIER_SYSTEM_INBOUND_PATH=/api/integrations/cashier/payment-status`
- `CASHIER_SHARED_TOKEN`

Notes:

- Render provides `PORT` automatically.
- `FRONTEND_ORIGIN` must exactly match your Netlify site origin.
- The standalone server exposes `GET /api/health` for Render health checks.

## 3. Point Netlify to Render

After Render gives you a backend URL like:

```text
https://clinicsystem-api.onrender.com
```

set this in Netlify:

- `VITE_BACKEND_API_BASE_URL=https://clinicsystem-api.onrender.com/api`

Then trigger a fresh Netlify deploy.

## 4. Why this is required

Netlify only hosts the frontend bundle. Your app's API routes such as:

- `/api/admin-auth`
- `/api/admin-profile`
- `/api/appointments`

need a live backend server. Render provides that backend.

## 5. Login behavior after deployment

Admin login should be opened from:

```text
https://nimble-platypus-f26709.netlify.app/admin/login
```

The frontend will call Render for `/api/admin-auth`, and the Render server is configured for:

- CORS with credentials
- cross-site auth cookies for Netlify <-> Render

## 6. After pushing

Push these files before deploying:

- `server/renderServer.ts`
- `server/supabaseApi.ts`
- `render.yaml`
- `package.json`
- `.env.example`
- `netlify.toml`
- `src/services/adminAuth.ts`
- `src/router/PublicRoutes.ts`
