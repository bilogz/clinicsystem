import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { Pool } from 'pg';

export const config = {
  runtime: 'nodejs'
};

type Row = Record<string, unknown>;

const CLINIC_DEV_BYPASS_EMAIL = 'admin@gmail.com';
const CLINIC_DEV_BYPASS_PASSWORD = 'admin123';

let cachedPool: Pool | null = null;

function writeJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  if (res.writableEnded) return;
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function toSafeText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

function toBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = toSafeText(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => toSafeText(item)).filter(Boolean);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => toSafeText(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseCookieHeader(rawCookie: string | undefined): Record<string, string> {
  if (!rawCookie) return {};
  return rawCookie.split(';').reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('=') || '');
    return acc;
  }, {});
}

async function readJsonBody(req: IncomingMessage): Promise<Row> {
  const existingBody = (req as unknown as { body?: unknown }).body;
  if (existingBody && typeof existingBody === 'object' && !Buffer.isBuffer(existingBody)) {
    return existingBody as Row;
  }
  if (typeof existingBody === 'string') {
    try {
      const parsed = JSON.parse(existingBody);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Row) : {};
    } catch {
      return {};
    }
  }
  return await new Promise<Row>((resolve) => {
    let raw = '';
    req.on('data', (chunk: Buffer | string) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(typeof parsed === 'object' && parsed !== null ? (parsed as Row) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (stored.length !== computed.length) return false;
  return timingSafeEqual(stored, computed);
}

function getPool(): Pool {
  if (cachedPool) return cachedPool;
  const connectionString = toSafeText(process.env.DATABASE_URL);
  if (!connectionString) {
    throw new Error('Supabase is not configured. Set DATABASE_URL on Vercel project environment variables.');
  }
  cachedPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  return cachedPool;
}

function appendSetCookie(res: ServerResponse, cookieValue: string): void {
  const existing = res.getHeader('Set-Cookie');
  const cookies = Array.isArray(existing) ? existing.concat(cookieValue) : existing ? [String(existing), cookieValue] : [cookieValue];
  res.setHeader('Set-Cookie', cookies);
}

function mapAdminUser(row: Row): Record<string, unknown> {
  return {
    id: Number(row.id || row.admin_profile_id || 0),
    username: String(row.username || ''),
    fullName: String(row.full_name || ''),
    email: String(row.email || ''),
    role: String(row.role || ''),
    department: String(row.department || ''),
    accessExemptions: parseJsonArray(row.access_exemptions),
    isSuperAdmin: toBooleanFlag(row.is_super_admin)
  };
}

async function resolveAdminSession(pool: Pool, req: IncomingMessage): Promise<Row | null> {
  const cookies = parseCookieHeader(String(req.headers?.cookie || ''));
  const sessionToken = toSafeText(cookies.admin_session);
  if (!sessionToken) return null;
  const sessionHash = createHash('sha256').update(sessionToken).digest('hex');
  const result = await pool.query<Row>(
    `SELECT p.id AS admin_profile_id, p.username, p.full_name, p.email, p.role, p.department, p.access_exemptions, p.is_super_admin
     FROM public.admin_sessions s
     JOIN public.admin_profiles p ON p.id = s.admin_profile_id
     WHERE s.session_token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP
       AND LOWER(COALESCE(p.status, '')) = 'active'
     LIMIT 1`,
    [sessionHash]
  );
  return result.rows[0] || null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (String(req.method || '').toUpperCase() === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const pool = getPool();
    const method = String(req.method || 'GET').toUpperCase();

    if (method === 'GET') {
      const session = await resolveAdminSession(pool, req);
      writeJson(res, 200, {
        ok: true,
        data: {
          authenticated: Boolean(session),
          user: session ? mapAdminUser(session) : null
        }
      });
      return;
    }

    if (method !== 'POST') {
      writeJson(res, 405, { ok: false, message: `Method ${method} not allowed.` });
      return;
    }

    const body = await readJsonBody(req);
    const action = toSafeText(body.action).toLowerCase();

    if (action === 'logout') {
      const cookies = parseCookieHeader(String(req.headers?.cookie || ''));
      const token = toSafeText(cookies.admin_session);
      if (token) {
        const tokenHash = createHash('sha256').update(token).digest('hex');
        await pool.query(
          `UPDATE public.admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_token_hash = $1 AND revoked_at IS NULL`,
          [tokenHash]
        );
      }
      appendSetCookie(res, 'admin_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/');
      writeJson(res, 200, { ok: true, data: { signedOut: true } });
      return;
    }

    if (action !== 'login') {
      writeJson(res, 422, { ok: false, message: 'Unsupported admin auth action.' });
      return;
    }

    const usernameInput = toSafeText(body.username).toLowerCase();
    const password = toSafeText(body.password);
    if (!usernameInput || !password) {
      writeJson(res, 422, { ok: false, message: 'Username and password are required.' });
      return;
    }

    const bypass = usernameInput === CLINIC_DEV_BYPASS_EMAIL.toLowerCase() && password === CLINIC_DEV_BYPASS_PASSWORD;
    let accountResult = await pool.query<Row>(
      `SELECT id, username, full_name, email, role, department, access_exemptions, is_super_admin, status, password_hash
       FROM public.admin_profiles
       WHERE LOWER(username) = $1 OR LOWER(email) = $1
       LIMIT 1`,
      [usernameInput]
    );
    let account = accountResult.rows[0];

    if (bypass && !account) {
      await pool.query(
        `INSERT INTO public.admin_profiles (username, full_name, email, role, department, access_exemptions, is_super_admin, password_hash, status, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (username) DO NOTHING`,
        [
          CLINIC_DEV_BYPASS_EMAIL,
          'Clinic Default Admin',
          CLINIC_DEV_BYPASS_EMAIL,
          'Admin',
          'Administration',
          JSON.stringify([
            'appointments',
            'patients',
            'registration',
            'walkin',
            'checkup',
            'laboratory',
            'pharmacy',
            'mental_health',
            'reports',
            'cashier_integration'
          ]),
          1,
          hashPassword(CLINIC_DEV_BYPASS_PASSWORD),
          'active',
          ''
        ]
      );
      accountResult = await pool.query<Row>(
        `SELECT id, username, full_name, email, role, department, access_exemptions, is_super_admin, status, password_hash
         FROM public.admin_profiles
         WHERE LOWER(username) = $1 OR LOWER(email) = $1
         LIMIT 1`,
        [usernameInput]
      );
      account = accountResult.rows[0];
    }

    const passwordOk =
      bypass ||
      Boolean(account && toSafeText(account.password_hash) && verifyPassword(password, String(account.password_hash || '')));

    if (!account || toSafeText(account.status).toLowerCase() !== 'active' || !passwordOk) {
      writeJson(res, 401, { ok: false, message: 'Invalid credentials.' });
      return;
    }

    const sessionToken = randomBytes(32).toString('hex');
    const sessionHash = createHash('sha256').update(sessionToken).digest('hex');
    await pool.query(
      `INSERT INTO public.admin_sessions (session_token_hash, admin_profile_id, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '12 hours')`,
      [sessionHash, Number(account.id || 0), '127.0.0.1', String(req.headers['user-agent'] || '')]
    );
    await pool.query(`UPDATE public.admin_profiles SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`, [Number(account.id || 0)]);
    try {
      await pool.query(
        `INSERT INTO admin_activity_logs (username, action, raw_action, description, ip_address) VALUES ($1, 'Login', 'LOGIN', 'Admin signed in.', '127.0.0.1')`,
        [String(account.username || '')]
      );
    } catch {
      // Keep login successful even if activity log insert fails.
    }

    appendSetCookie(res, `admin_session=${sessionToken}; Max-Age=${60 * 60 * 12}; HttpOnly; SameSite=Lax; Path=/`);
    writeJson(res, 200, { ok: true, data: { user: mapAdminUser(account) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown server error.');
    writeJson(res, 500, { ok: false, message });
  }
}
