import type { IncomingMessage, ServerResponse } from 'http';
import { createSupabaseApiMiddleware } from '../server/supabaseApi';

export const config = {
  runtime: 'nodejs'
};

type ApiMiddleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void | Promise<void>;

let cachedMiddleware: ApiMiddleware | null = null;
let cachedInitError: Error | null = null;

function writeJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  if (res.writableEnded) return;
  try {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  } catch {
    // ignore — headers may already have been sent
  }
}

function getMiddleware(): ApiMiddleware {
  if (cachedMiddleware) return cachedMiddleware;
  if (cachedInitError) throw cachedInitError;
  try {
    cachedMiddleware = createSupabaseApiMiddleware({
      databaseUrl: process.env.DATABASE_URL,
      cashierEnabled: process.env.CASHIER_INTEGRATION_ENABLED,
      cashierBaseUrl: process.env.CASHIER_SYSTEM_BASE_URL,
      cashierSharedToken: process.env.CASHIER_SHARED_TOKEN,
      cashierSyncMode: process.env.CASHIER_SYNC_MODE,
      cashierInboundPath: process.env.CASHIER_SYSTEM_INBOUND_PATH,
      departmentSharedToken: process.env.DEPARTMENT_INTEGRATION_SHARED_TOKEN
    }) as unknown as ApiMiddleware;
    return cachedMiddleware;
  } catch (error) {
    cachedInitError = error instanceof Error ? error : new Error(String(error));
    throw cachedInitError;
  }
}

function normalizeRequest(req: IncomingMessage): void {
  const method = String(req.method || '').toUpperCase();
  if (!method && (req as unknown as { body?: unknown }).body != null) {
    req.method = 'POST';
  } else if (method === 'HEAD') {
    req.method = 'GET';
  }
}

function errorPayload(error: unknown): Record<string, unknown> {
  const diagnostics = process.env.API_DIAGNOSTICS === '1' || process.env.VERCEL_ENV !== 'production';
  const message = error instanceof Error ? error.message : String(error || 'Unknown server error.');
  const payload: Record<string, unknown> = { ok: false, message };
  if (diagnostics && error instanceof Error && error.stack) {
    payload.stack = error.stack.split('\n').slice(0, 8).join('\n');
  }
  if (diagnostics) {
    payload.hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  }
  return payload;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    normalizeRequest(req);
    if (String(req.method || '').toUpperCase() === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if ((req.url || '').startsWith('/api/health')) {
      writeJson(res, 200, {
        ok: true,
        data: {
          status: 'ok',
          hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
          vercelEnv: process.env.VERCEL_ENV || null
        }
      });
      return;
    }

    const middleware = getMiddleware();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (err?: unknown): void => {
        if (settled) return;
        settled = true;
        if (err) reject(err instanceof Error ? err : new Error(String(err)));
        else resolve();
      };

      res.on('close', () => finish());
      res.on('finish', () => finish());
      res.on('error', (err) => finish(err));

      try {
        const maybePromise = middleware(req, res, () => {
          writeJson(res, 404, { ok: false, message: 'API route not found.' });
          finish();
        });
        Promise.resolve(maybePromise as unknown).catch(finish);
      } catch (err) {
        finish(err);
      }
    });
  } catch (error) {
    try {
      // eslint-disable-next-line no-console
      console.error('[api] handler failure:', error);
    } catch {
      // ignore logger errors
    }
    writeJson(res, 500, errorPayload(error));
  }
}
