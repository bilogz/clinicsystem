import type { IncomingMessage, ServerResponse } from 'http';
import { createSupabaseApiMiddleware } from '../server/supabaseApi';

export const config = {
  runtime: 'nodejs'
};

const apiMiddleware = createSupabaseApiMiddleware({
  databaseUrl: process.env.DATABASE_URL,
  cashierEnabled: process.env.CASHIER_INTEGRATION_ENABLED,
  cashierBaseUrl: process.env.CASHIER_SYSTEM_BASE_URL,
  cashierSharedToken: process.env.CASHIER_SHARED_TOKEN,
  cashierSyncMode: process.env.CASHIER_SYNC_MODE,
  cashierInboundPath: process.env.CASHIER_SYSTEM_INBOUND_PATH,
  departmentSharedToken: process.env.DEPARTMENT_INTEGRATION_SHARED_TOKEN
});

function writeJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  const normalizedMethod = String(req.method || '').toUpperCase();
  if (!normalizedMethod && (req as any).body != null) {
    req.method = 'POST';
  } else if (normalizedMethod === 'HEAD') {
    req.method = 'GET';
  } else if (normalizedMethod === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if ((req.url || '').startsWith('/api/health')) {
    writeJson(res, 200, { ok: true, data: { status: 'ok' } });
    return;
  }

  apiMiddleware(req, res, () => {
    writeJson(res, 404, { ok: false, message: 'API route not found.' });
  });
}
