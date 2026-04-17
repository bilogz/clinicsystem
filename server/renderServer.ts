import http from 'http';
import { createSupabaseApiMiddleware } from './supabaseApi.ts';

function splitCsv(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeOrigin(value: string): string {
  return value.replace(/\/+$/, '');
}

function withCrossSiteCookies(headerValue: string): string {
  let next = headerValue.replace(/SameSite=Lax/gi, 'SameSite=None');
  if (!/;\s*Secure\b/i.test(next)) {
    next = `${next}; Secure`;
  }
  return next;
}

const allowedOrigins = new Set(splitCsv(process.env.FRONTEND_ORIGIN).map(normalizeOrigin));
const apiMiddleware = createSupabaseApiMiddleware({
  databaseUrl: process.env.DATABASE_URL,
  cashierEnabled: process.env.CASHIER_INTEGRATION_ENABLED,
  cashierBaseUrl: process.env.CASHIER_SYSTEM_BASE_URL,
  cashierSharedToken: process.env.CASHIER_SHARED_TOKEN,
  cashierSyncMode: process.env.CASHIER_SYNC_MODE,
  cashierInboundPath: process.env.CASHIER_SYSTEM_INBOUND_PATH,
  departmentSharedToken: process.env.DEPARTMENT_INTEGRATION_SHARED_TOKEN
});

const server = http.createServer((req, res) => {
  const requestOrigin = normalizeOrigin(String(req.headers.origin || ''));
  const originAllowed = requestOrigin && allowedOrigins.has(requestOrigin);

  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Integration-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Vary', 'Origin');

    const originalSetHeader = res.setHeader.bind(res);
    res.setHeader = ((name: string, value: number | string | readonly string[]) => {
      if (name.toLowerCase() === 'set-cookie') {
        const cookies = Array.isArray(value) ? value.map((entry) => withCrossSiteCookies(String(entry))) : withCrossSiteCookies(String(value));
        return originalSetHeader(name, cookies);
      }
      return originalSetHeader(name, value);
    }) as typeof res.setHeader;
  }

  if ((req.method || 'GET').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if ((req.url || '') === '/api/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, data: { status: 'ok' } }));
    return;
  }

  apiMiddleware(req, res, () => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, message: 'API route not found.' }));
  });
});

const port = Number.parseInt(String(process.env.PORT || process.env.API_PORT || '3001'), 10);

server.listen(Number.isFinite(port) ? port : 3001, () => {
  console.log(`Clinic API server listening on port ${Number.isFinite(port) ? port : 3001}`);
});
