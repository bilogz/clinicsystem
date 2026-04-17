import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { Pool as NodePgPool } from 'pg';
import type { Plugin } from 'vite';

export type SupabaseApiOptions = {
  databaseUrl?: string;
  cashierEnabled?: string;
  cashierBaseUrl?: string;
  cashierSharedToken?: string;
  cashierSyncMode?: string;
  cashierInboundPath?: string;
  departmentSharedToken?: string;
};

type JsonRecord = Record<string, unknown>;

type RowDataPacket = Record<string, any>;

type DbPool = {
  query<T extends RowDataPacket = RowDataPacket>(sql: string, params?: unknown[]): Promise<[T[], null]>;
  end(): Promise<void>;
};

// Backward-compatible alias so the rest of the file doesn't need a massive rewrite.
type Pool = DbPool;

let pgPool: DbPool | null = null;

function parseCookieHeader(rawCookie: string | undefined): Record<string, string> {
  if (!rawCookie) return {};
  return rawCookie.split(';').reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('=') || '');
    return acc;
  }, {});
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

function writeJson(res: any, statusCode: number, payload: JsonRecord): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: any): Promise<JsonRecord> {
  if (req && typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body)) {
    return req.body as JsonRecord;
  }

  if (req && typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return typeof parsed === 'object' && parsed !== null ? (parsed as JsonRecord) : {};
    } catch {
      return {};
    }
  }

  return await new Promise((resolve) => {
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
        resolve(typeof parsed === 'object' && parsed !== null ? parsed : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function toSafeText(value: unknown): string {
  return String(value ?? '').trim();
}

function toSafeInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toSafeMoney(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed * 100) / 100;
}

function toLocalIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDoctorFilter(value: string): string {
  return value.replace(/^doctor:\s*/i, '').trim();
}

function normalizePatientType(value: unknown): 'student' | 'teacher' | 'unknown' {
  const normalized = toSafeText(value).toLowerCase();
  if (normalized === 'student' || normalized === 'teacher') return normalized;
  if (/^(stu|student)[-_:/\s]*/i.test(normalized)) return 'student';
  if (/^(emp|teacher|faculty|staff|prof|instructor)[-_:/\s]*/i.test(normalized)) return 'teacher';
  return 'unknown';
}

function inferPatientType(input: {
  patientType?: unknown;
  actorRole?: unknown;
  patientName?: unknown;
  patientEmail?: unknown;
  concern?: unknown;
  visitType?: unknown;
  patientId?: unknown;
  age?: unknown;
}): 'student' | 'teacher' | 'unknown' {
  const explicitType = normalizePatientType(input.patientType);
  if (explicitType !== 'unknown') return explicitType;

  const actorType = normalizePatientType(input.actorRole);
  if (actorType !== 'unknown') return actorType;

  const normalizedPatientId = toSafeText(input.patientId).toLowerCase();
  if (/^(stu|student)[-_:/]/i.test(normalizedPatientId)) return 'student';
  if (/^(emp|teacher|faculty|staff)[-_:/]/i.test(normalizedPatientId)) return 'teacher';

  const haystack = [
    input.patientName,
    input.patientEmail,
    input.concern,
    input.visitType,
    input.patientId
  ]
    .map((value) => toSafeText(value).toLowerCase())
    .filter(Boolean)
    .join(' ');

  if (/(teacher|faculty|professor|prof\.|instructor|staff)/i.test(haystack)) return 'teacher';
  if (/(student|learner|pupil)/i.test(haystack)) return 'student';

  const numericAge = Number(input.age ?? 0);
  if (Number.isFinite(numericAge) && numericAge > 0) {
    if (numericAge <= 23) return 'student';
    if (numericAge >= 24) return 'teacher';
  }

  return 'student';
}

function currentDateString(): string {
  return toLocalIsoDate(new Date());
}

function toSqlDate(value: unknown): string | null {
  const text = toSafeText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function toSqlDateTime(value: unknown): string | null {
  const text = toSafeText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function formatDateCell(value: unknown): string {
  if (value instanceof Date) return toLocalIsoDate(value);
  return toSafeText(value);
}

function formatDateTimeCell(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = toSafeText(value);
  if (!text) return '';
  const normalizedText =
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(text)
      ? text
      : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/i.test(text)
        ? text.replace(' ', 'T') + 'Z'
        : text;
  const parsed = new Date(normalizedText);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  const text = toSafeText(value);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  const text = toSafeText(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function extractIsoTimestamp(value: unknown): string | null {
  const text = toSafeText(value);
  if (!text) return null;
  const match = text.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/);
  return match?.[1] || null;
}

function resolveReportDeliveryTimestamp(metadata: Record<string, unknown>, entityKey: unknown, createdAt: unknown): string {
  return formatDateTimeCell(
    metadata.dispatched_at ||
      metadata.generated_at ||
      metadata.report_generated_at ||
      extractIsoTimestamp(metadata.report_reference) ||
      extractIsoTimestamp(entityKey) ||
      createdAt
  );
}

function toBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = toSafeText(value).toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function buildDateSeries(fromDate: string, toDate: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function buildRecentMonthSeries(totalMonths: number): Array<{ key: string; label: string; start: string; end: string }> {
  const series: Array<{ key: string; label: string; start: string; end: string }> = [];
  const now = new Date();
  for (let offset = totalMonths - 1; offset >= 0; offset -= 1) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    const label = monthStart.toLocaleString('en-US', { month: 'short' });
    series.push({
      key: label.toLowerCase(),
      label,
      start: monthStart.toISOString().slice(0, 10),
      end: nextMonthStart.toISOString().slice(0, 10)
    });
  }
  return series;
}

function matchesDateRange(period: string): { sql: string; params: string[] } | null {
  const today = new Date();
  const yyyyMmDd = (value: Date) => value.toISOString().slice(0, 10);

  if (period === 'today') {
    const date = yyyyMmDd(today);
    return { sql: 'appointment_date = ?', params: [date] };
  }
  if (period === 'period: upcoming' || period === 'upcoming') {
    return { sql: 'appointment_date >= ?', params: [yyyyMmDd(today)] };
  }
  if (period === 'this week') {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { sql: 'appointment_date >= ? AND appointment_date < ?', params: [yyyyMmDd(start), yyyyMmDd(end)] };
  }
  if (period === 'this month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return { sql: 'appointment_date >= ? AND appointment_date < ?', params: [yyyyMmDd(start), yyyyMmDd(end)] };
  }
  return null;
}

function convertQuestionMarksToDollarParams(sql: string): string {
  let index = 0;
  let inSingle = false;
  let inDouble = false;
  let out = '';
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'" && !inDouble) {
      const prev = sql[i - 1];
      if (prev !== '\\') inSingle = !inSingle;
      out += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      const prev = sql[i - 1];
      if (prev !== '\\') inDouble = !inDouble;
      out += ch;
      continue;
    }
    if (ch === '?' && !inSingle && !inDouble) {
      index += 1;
      out += `$${index}`;
      continue;
    }
    out += ch;
  }
  return out;
}

function createDbPool(options: SupabaseApiOptions): DbPool | null {
  const databaseUrl = toSafeText(options.databaseUrl || process.env.DATABASE_URL);
  if (!databaseUrl) return null;
  if (
    /your-password/i.test(databaseUrl) ||
    /your-project-ref/i.test(databaseUrl) ||
    /YOUR-PROJECT/i.test(databaseUrl) ||
    /replace-with-an-anon-key/i.test(databaseUrl)
  ) {
    throw new Error(
      'Supabase is not configured. Set a real Supabase PostgreSQL DATABASE_URL in .env before signing in.'
    );
  }

  const innerPool = new NodePgPool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    // Prefer core app tables in `public`, while still resolving integration tables from `clinic`.
    options: '-c search_path=public,clinic'
  });

  return {
    async query<T extends RowDataPacket = RowDataPacket>(sql: string, params: unknown[] = []): Promise<[T[], null]> {
      const rewritten = normalizeSqlForPostgres(sql);
      const text = convertQuestionMarksToDollarParams(rewritten);
      const result = await innerPool.query(text, params as any[]);
      return [result.rows as T[], null];
    },
    async end(): Promise<void> {
      await innerPool.end();
    }
  };
}

async function getPool(options: SupabaseApiOptions): Promise<DbPool | null> {
  if (!pgPool) {
    pgPool = createDbPool(options);
  }
  return pgPool;
}

async function ensureModuleActivityLogsTable(_pool: DbPool): Promise<void> {
  // Supabase-only: tables come from `supabase/schema.sql`.
  return;
}

async function ensureHealthReportsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clinic_health_reports (
      id                  BIGSERIAL PRIMARY KEY,
      report_code         VARCHAR(60)  NOT NULL UNIQUE,
      student_id          VARCHAR(80)  NULL,
      student_name        VARCHAR(150) NOT NULL,
      student_type        VARCHAR(20)  NOT NULL DEFAULT 'student',
      grade_section       VARCHAR(120) NULL,
      age                 SMALLINT     NULL,
      sex                 VARCHAR(20)  NULL,
      health_issue        TEXT         NOT NULL,
      symptoms            TEXT         NULL,
      severity            VARCHAR(20)  NOT NULL DEFAULT 'low',
      treatment_given     TEXT         NULL,
      medicines_used      JSONB        NOT NULL DEFAULT '[]'::jsonb,
      first_aid_given     TEXT         NULL,
      attending_staff     VARCHAR(150) NOT NULL DEFAULT '',
      remarks             TEXT         NULL,
      sent_to_pmed        SMALLINT     NOT NULL DEFAULT 0,
      pmed_sent_at        TIMESTAMP    NULL,
      pmed_entity_key     VARCHAR(120) NULL,
      created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
    )
  `);
}

async function insertModuleActivity(
  pool: Pool,
  moduleName: string,
  action: string,
  detail: string,
  actor: string,
  entityType: string | null,
  entityKey: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await ensureModuleActivityLogsTable(pool);
  await pool.query(
    `INSERT INTO module_activity_logs (module, action, detail, actor, entity_type, entity_key, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [moduleName, action, detail, actor || 'System', entityType, entityKey, JSON.stringify(metadata)]
  );
}

function cashierIntegrationEnabled(options: SupabaseApiOptions): boolean {
  return toSafeText(options.cashierEnabled).toLowerCase() === 'true';
}

function cashierSyncMode(options: SupabaseApiOptions): 'queue' | 'auto' {
  return toSafeText(options.cashierSyncMode).toLowerCase() === 'auto' ? 'auto' : 'queue';
}

function cashierUsesInternalSync(options: SupabaseApiOptions): boolean {
  if (!cashierIntegrationEnabled(options)) return false;
  const normalized = toSafeText(options.cashierBaseUrl).replace(/\/+$/, '').toLowerCase();
  return normalized === '' || normalized === 'internal' || normalized === 'supabase://internal' || normalized === 'supabase-internal';
}

function cashierResolvedBaseUrl(options: SupabaseApiOptions): string {
  const baseUrl = toSafeText(options.cashierBaseUrl).replace(/\/+$/, '');
  if (cashierUsesInternalSync(options)) return 'supabase://internal';
  return baseUrl;
}

function cashierResolvedInboundPath(options: SupabaseApiOptions): string {
  return toSafeText(options.cashierInboundPath) || '/api/integrations/cashier/payment-status';
}

function normalizePaymentStatus(value: unknown): 'unpaid' | 'partial' | 'paid' | 'void' {
  const normalized = toSafeText(value).toLowerCase();
  if (normalized === 'paid' || normalized === 'partial' || normalized === 'void') return normalized;
  return 'unpaid';
}

function normalizeCashierPaymentMethod(value: unknown): string | null {
  const normalized = toSafeText(value);
  if (!normalized) return null;
  const upper = normalized.toUpperCase();
  if (upper === 'HMA') return 'HMA';
  if (upper === 'HMO') return 'HMO';
  if (upper === 'CASH') return 'Cash';
  if (upper === 'CARD') return 'Card';
  if (upper === 'ONLINE') return 'Online';
  return normalized;
}

function canManageCashierFinancials(session: RowDataPacket | null): boolean {
  if (!session) return false;
  if (toBooleanFlag(session.is_super_admin)) return true;

  const role = toSafeText(session.role).toLowerCase();
  const department = toSafeText(session.department).toLowerCase();
  const access = parseJsonArray(session.access_exemptions).map((entry) => toSafeText(entry).toLowerCase());

  const matchesFinanceScope = (value: string): boolean =>
    value.includes('cashier') || value.includes('finance') || value.includes('billing');

  return matchesFinanceScope(role) || matchesFinanceScope(department) || access.some(matchesFinanceScope);
}

function appointmentRequiresCashierVerification(input: {
  cashierBillingId?: unknown;
  cashierReference?: unknown;
  amountDue?: unknown;
}): boolean {
  return toSafeInt(input.cashierBillingId, 0) > 0 || toSafeText(input.cashierReference) !== '' || toSafeMoney(input.amountDue, 0) > 0;
}

function appointmentCanProceedByCashier(input: {
  cashierBillingId?: unknown;
  cashierReference?: unknown;
  amountDue?: unknown;
  cashierPaymentStatus?: unknown;
}): boolean {
  if (!appointmentRequiresCashierVerification(input)) return true;
  return normalizePaymentStatus(input.cashierPaymentStatus) === 'paid';
}

function buildCashierEventKey(parts: Array<string | number | null | undefined>): string {
  return createHash('sha256')
    .update(parts.map((part) => toSafeText(part)).join('|'))
    .digest('hex');
}

type DepartmentFlowMessage = {
  message: string;
  from?: string;
  to?: string;
};

type DepartmentFlowProfileSeed = {
  departmentKey: string;
  departmentName: string;
  flowOrder: number;
  clearanceStageOrder: number;
  receives: DepartmentFlowMessage[];
  sends: DepartmentFlowMessage[];
  notes: string;
};

const DEFAULT_DEPARTMENT_FLOW_PROFILES: DepartmentFlowProfileSeed[] = [
  {
    departmentKey: 'clinic',
    departmentName: 'Clinic',
    flowOrder: 3,
    clearanceStageOrder: 3,
    receives: [
      { message: 'Student identity data', from: 'registrar' },
      { message: 'Staff identity data', from: 'hr' },
      { message: 'Health incident reports', from: 'prefect' }
    ],
    sends: [
      { message: 'Medical clearance status', to: 'registrar' },
      { message: 'Visit history summary', to: 'pmed' }
    ],
    notes: 'Stores medical visits, consultations, health records, and clearances.'
  }
];

let clinicIntegrationBootstrapPromise: Promise<void> | null = null;

function normalizeSqlForPostgres(sql: string): string {
  const replacements: Array<[string, string]> = [
    ['department_flow_profiles', 'clinic.department_flow_profiles'],
    ['department_clearance_records', 'clinic.department_clearance_records'],
    ['cashier_integration_events', 'clinic.cashier_integration_events'],
    ['cashier_payment_links', 'clinic.cashier_payment_links'],
    ['clinic_cashier_sync_logs', 'clinic.clinic_cashier_sync_logs'],
    ['clinic_cashier_audit_logs', 'clinic.clinic_cashier_audit_logs']
  ];
  let inSingle = false;
  let inDouble = false;
  let out = '';

  const isIdentifierBoundary = (value: string | undefined): boolean => value == null || !/[A-Za-z0-9_$.]/.test(value);

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'" && !inDouble) {
      const prev = sql[i - 1];
      if (prev !== '\\') inSingle = !inSingle;
      out += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      const prev = sql[i - 1];
      if (prev !== '\\') inDouble = !inDouble;
      out += ch;
      continue;
    }
    if (!inSingle && !inDouble) {
      const replacement = replacements.find(([source]) =>
        sql.startsWith(source, i) && isIdentifierBoundary(sql[i - 1]) && isIdentifierBoundary(sql[i + source.length])
      );
      if (replacement) {
        out += replacement[1];
        i += replacement[0].length - 1;
        continue;
      }
    }
    out += ch;
  }

  return out;
}

async function bootstrapClinicIntegrationSchema(pool: Pool): Promise<void> {
  await pool.query('CREATE SCHEMA IF NOT EXISTS clinic');
  await pool.query(
    `CREATE OR REPLACE FUNCTION clinic.set_updated_at_timestamp()
     RETURNS trigger
     LANGUAGE plpgsql
     AS $$
     BEGIN
       NEW.updated_at = NOW();
       RETURN NEW;
     END;
     $$;`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS clinic.department_flow_profiles (
       department_key TEXT PRIMARY KEY,
       department_name TEXT NOT NULL,
       flow_order INT NOT NULL UNIQUE,
       clearance_stage_order INT NOT NULL UNIQUE,
       receives JSONB NOT NULL DEFAULT '[]'::jsonb,
       sends JSONB NOT NULL DEFAULT '[]'::jsonb,
       notes TEXT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS clinic.department_clearance_records (
       id BIGSERIAL PRIMARY KEY,
       clearance_reference TEXT NOT NULL UNIQUE,
       patient_id TEXT NULL,
       patient_code TEXT NULL,
       patient_name TEXT NOT NULL,
       patient_type TEXT NOT NULL DEFAULT 'unknown',
       department_key TEXT NOT NULL REFERENCES clinic.department_flow_profiles (department_key) ON DELETE RESTRICT,
       department_name TEXT NOT NULL,
       stage_order INT NOT NULL,
       status TEXT NOT NULL DEFAULT 'pending',
       remarks TEXT NULL,
       approver_name TEXT NULL,
       approver_role TEXT NULL,
       external_reference TEXT NULL,
       requested_by TEXT NULL,
       decided_at TIMESTAMPTZ NULL,
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS clinic.cashier_integration_events (
       id BIGSERIAL PRIMARY KEY,
       event_key TEXT NOT NULL UNIQUE,
       source_module TEXT NOT NULL,
       source_entity TEXT NOT NULL,
       source_key TEXT NOT NULL,
       patient_name TEXT NULL,
       patient_type TEXT NOT NULL DEFAULT 'unknown',
       reference_no TEXT NULL,
       amount_due NUMERIC(10, 2) NOT NULL DEFAULT 0,
       currency_code TEXT NOT NULL DEFAULT 'PHP',
       payment_status TEXT NOT NULL DEFAULT 'unpaid',
       sync_status TEXT NOT NULL DEFAULT 'pending',
       last_error TEXT NULL,
       synced_at TIMESTAMPTZ NULL,
       payload JSONB NOT NULL DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS clinic.cashier_payment_links (
       id BIGSERIAL PRIMARY KEY,
       source_module TEXT NOT NULL,
       source_key TEXT NOT NULL,
       cashier_reference TEXT NULL,
       cashier_billing_id BIGINT NULL,
       invoice_number TEXT NULL,
       official_receipt TEXT NULL,
       amount_due NUMERIC(10, 2) NOT NULL DEFAULT 0,
       amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0,
       balance_due NUMERIC(10, 2) NOT NULL DEFAULT 0,
       payment_status TEXT NOT NULL DEFAULT 'unpaid',
       latest_payment_method TEXT NULL,
       cashier_can_proceed SMALLINT NOT NULL DEFAULT 0,
       cashier_verified_at TIMESTAMPTZ NULL,
       paid_at TIMESTAMPTZ NULL,
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       UNIQUE (source_module, source_key)
     )`
  );
  await pool.query(
    `ALTER TABLE clinic.department_clearance_records
       DROP CONSTRAINT IF EXISTS department_clearance_records_patient_type_check`
  );
  await pool.query(
    `ALTER TABLE clinic.department_clearance_records
       ADD CONSTRAINT department_clearance_records_patient_type_check
       CHECK (patient_type IN ('student', 'teacher', 'unknown')) NOT VALID`
  );
  await pool.query(
    `ALTER TABLE clinic.cashier_integration_events
       DROP CONSTRAINT IF EXISTS cashier_integration_events_patient_type_check`
  );
  await pool.query(
    `ALTER TABLE clinic.cashier_integration_events
       ADD CONSTRAINT cashier_integration_events_patient_type_check
       CHECK (patient_type IN ('student', 'teacher', 'unknown')) NOT VALID`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_clearance_department
       ON clinic.department_clearance_records (department_key, status, created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_clearance_patient
       ON clinic.department_clearance_records (patient_name, patient_code)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_cashier_events_sync_status
       ON clinic.cashier_integration_events (sync_status, created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_cashier_events_source_lookup
       ON clinic.cashier_integration_events (source_module, source_key)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_cashier_reference
       ON clinic.cashier_payment_links (cashier_reference)`
  );
  await pool.query(
    `DROP TRIGGER IF EXISTS trg_department_flow_profiles_updated_at ON clinic.department_flow_profiles`
  );
  await pool.query(
    `CREATE TRIGGER trg_department_flow_profiles_updated_at
       BEFORE UPDATE ON clinic.department_flow_profiles
       FOR EACH ROW
       EXECUTE FUNCTION clinic.set_updated_at_timestamp()`
  );
  await pool.query(
    `DROP TRIGGER IF EXISTS trg_department_clearance_records_updated_at ON clinic.department_clearance_records`
  );
  await pool.query(
    `CREATE TRIGGER trg_department_clearance_records_updated_at
       BEFORE UPDATE ON clinic.department_clearance_records
       FOR EACH ROW
       EXECUTE FUNCTION clinic.set_updated_at_timestamp()`
  );
  await pool.query(
    `DROP TRIGGER IF EXISTS trg_cashier_integration_events_updated_at ON clinic.cashier_integration_events`
  );
  await pool.query(
    `CREATE TRIGGER trg_cashier_integration_events_updated_at
       BEFORE UPDATE ON clinic.cashier_integration_events
       FOR EACH ROW
       EXECUTE FUNCTION clinic.set_updated_at_timestamp()`
  );
  await pool.query(
    `DROP TRIGGER IF EXISTS trg_cashier_payment_links_updated_at ON clinic.cashier_payment_links`
  );
  await pool.query(
    `CREATE TRIGGER trg_cashier_payment_links_updated_at
       BEFORE UPDATE ON clinic.cashier_payment_links
       FOR EACH ROW
       EXECUTE FUNCTION clinic.set_updated_at_timestamp()`
  );
  await pool.query(
    `DO $$
     BEGIN
       IF to_regclass('public.department_flow_profiles') IS NULL THEN
         EXECUTE 'CREATE VIEW public.department_flow_profiles AS SELECT * FROM clinic.department_flow_profiles';
       END IF;
       IF to_regclass('public.department_clearance_records') IS NULL THEN
         EXECUTE 'CREATE VIEW public.department_clearance_records AS SELECT * FROM clinic.department_clearance_records';
       END IF;
       IF to_regclass('public.cashier_integration_events') IS NULL THEN
         EXECUTE 'CREATE VIEW public.cashier_integration_events AS SELECT * FROM clinic.cashier_integration_events';
       END IF;
       IF to_regclass('public.cashier_payment_links') IS NULL THEN
         EXECUTE 'CREATE VIEW public.cashier_payment_links AS SELECT * FROM clinic.cashier_payment_links';
       END IF;
     END $$;`
  );

  for (const profile of DEFAULT_DEPARTMENT_FLOW_PROFILES) {
    await pool.query(
      `INSERT INTO clinic.department_flow_profiles (
         department_key, department_name, flow_order, clearance_stage_order, receives, sends, notes
       ) VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)
       ON CONFLICT (department_key) DO UPDATE SET
         department_name = EXCLUDED.department_name,
         flow_order = EXCLUDED.flow_order,
         clearance_stage_order = EXCLUDED.clearance_stage_order,
         receives = EXCLUDED.receives,
         sends = EXCLUDED.sends,
         notes = EXCLUDED.notes,
         updated_at = NOW()`,
      [
        profile.departmentKey,
        profile.departmentName,
        profile.flowOrder,
        profile.clearanceStageOrder,
        JSON.stringify(profile.receives),
        JSON.stringify(profile.sends),
        profile.notes
      ]
    );
  }
}

async function ensureClinicIntegrationBootstrap(pool: Pool): Promise<void> {
  if (!clinicIntegrationBootstrapPromise) {
    clinicIntegrationBootstrapPromise = bootstrapClinicIntegrationSchema(pool).catch((error) => {
      clinicIntegrationBootstrapPromise = null;
      throw error;
    });
  }
  await clinicIntegrationBootstrapPromise;
}

async function ensureCashierIntegrationTables(pool: Pool): Promise<void> {
  await ensureClinicIntegrationBootstrap(pool);
}

async function ensureHrStaffRequestTables(pool: Pool): Promise<void> {
  await ensureClinicIntegrationBootstrap(pool);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS clinic`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS public.hr_staff_directory (
       id BIGSERIAL PRIMARY KEY,
       employee_no TEXT NOT NULL UNIQUE,
       full_name TEXT NOT NULL,
       role_type TEXT NOT NULL DEFAULT 'nurse',
       department_name TEXT NOT NULL DEFAULT 'General Medicine',
       employment_status TEXT NOT NULL DEFAULT 'active',
       contact_email TEXT NULL,
       contact_phone TEXT NULL,
       hired_at TIMESTAMPTZ NULL,
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS public.hr_staff_requests (
       id BIGSERIAL PRIMARY KEY,
       request_reference TEXT NOT NULL UNIQUE,
       staff_id BIGINT NOT NULL REFERENCES public.hr_staff_directory (id) ON DELETE RESTRICT,
       request_status TEXT NOT NULL DEFAULT 'pending',
       request_notes TEXT NULL,
       requested_by TEXT NULL,
       decided_by TEXT NULL,
       decided_at TIMESTAMPTZ NULL,
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hr_staff_directory_role_status ON public.hr_staff_directory (role_type, employment_status, full_name)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hr_staff_requests_status_created ON public.hr_staff_requests (request_status, created_at DESC)`);
  await pool.query(`
    DO $$
    BEGIN
      CREATE TRIGGER trg_hr_staff_directory_updated_at
      BEFORE UPDATE ON public.hr_staff_directory
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at_timestamp();
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      CREATE TRIGGER trg_hr_staff_requests_updated_at
      BEFORE UPDATE ON public.hr_staff_requests
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at_timestamp();
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await pool.query(
    `INSERT INTO public.hr_staff_directory (employee_no, full_name, role_type, department_name, employment_status, contact_email, contact_phone, hired_at)
     VALUES
       ('HR-DOC-1001', 'Dr. Alyssa Rivera', 'doctor', 'General Medicine', 'active', 'alyssa.rivera@bcp.edu.ph', '09171230001', NOW()),
       ('HR-DOC-1002', 'Dr. Marco Santos', 'doctor', 'Emergency', 'working', 'marco.santos@bcp.edu.ph', '09171230002', NOW()),
       ('HR-NUR-2001', 'Nurse Clarisse Lim', 'nurse', 'General Ward', 'active', 'clarisse.lim@bcp.edu.ph', '09171230003', NOW()),
       ('HR-NUR-2002', 'Nurse Paolo Reyes', 'nurse', 'Outpatient', 'working', 'paolo.reyes@bcp.edu.ph', '09171230004', NOW())
     ON CONFLICT (employee_no) DO NOTHING`
  );
}

async function syncAppointmentCashierColumnsFromLinks(pool: Pool, bookingId?: string): Promise<void> {
  await ensureCashierIntegrationTables(pool);

  const filters = [`p.source_module = 'appointments'`, `p.source_key = a.booking_id`];
  const params: Array<string | number> = [];

  if (bookingId && bookingId.trim() !== '') {
    filters.push('a.booking_id = ?');
    params.push(bookingId.trim());
  }

  await pool.query(
    `UPDATE patient_appointments a
     SET cashier_billing_id = p.cashier_billing_id,
         cashier_billing_no = COALESCE(NULLIF(p.invoice_number, ''), NULLIF(p.cashier_reference, ''), a.cashier_billing_no),
         cashier_payment_status = COALESCE(NULLIF(p.payment_status, ''), a.cashier_payment_status),
         cashier_can_proceed = CASE WHEN COALESCE(NULLIF(p.payment_status, ''), 'unpaid') = 'paid' THEN 1 ELSE 0 END,
         cashier_verified_at = CASE
           WHEN COALESCE(NULLIF(p.payment_status, ''), 'unpaid') = 'paid' THEN COALESCE(p.paid_at, a.cashier_verified_at, CURRENT_TIMESTAMP)
           ELSE a.cashier_verified_at
         END,
         updated_at = CURRENT_TIMESTAMP
     FROM cashier_payment_links p
     WHERE ${filters.join(' AND ')}`,
    params
  );
}

async function queueCashierIntegrationEvent(
  pool: Pool,
  params: {
    sourceModule: string;
    sourceEntity: string;
    sourceKey: string;
    patientName?: string | null;
    patientType?: string | null;
    referenceNo?: string | null;
    amountDue?: number;
    currencyCode?: string;
    paymentStatus?: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  await ensureCashierIntegrationTables(pool);
  const eventKey = buildCashierEventKey([params.sourceModule, params.sourceEntity, params.sourceKey, params.referenceNo]);
  await pool.query(
    `INSERT INTO cashier_integration_events (
      event_key, source_module, source_entity, source_key, patient_name, patient_type,
      reference_no, amount_due, currency_code, payment_status, sync_status, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    ON CONFLICT (event_key) DO UPDATE SET
      patient_name = EXCLUDED.patient_name,
      patient_type = EXCLUDED.patient_type,
      reference_no = EXCLUDED.reference_no,
      amount_due = EXCLUDED.amount_due,
      currency_code = EXCLUDED.currency_code,
      payment_status = EXCLUDED.payment_status,
      sync_status = 'pending',
      last_error = NULL,
      payload = EXCLUDED.payload,
      updated_at = CURRENT_TIMESTAMP`,
    [
      eventKey,
      params.sourceModule,
      params.sourceEntity,
      params.sourceKey,
      params.patientName || null,
      normalizePatientType(params.patientType),
      params.referenceNo || null,
      toSafeMoney(params.amountDue, 0),
      toSafeText(params.currencyCode) || 'PHP',
      normalizePaymentStatus(params.paymentStatus),
      JSON.stringify(params.payload || {})
    ]
  );
}

async function backfillAppointmentCashierEvents(pool: Pool, options: SupabaseApiOptions, limit = 50): Promise<void> {
  await ensureCashierIntegrationTables(pool);
  const [missingRows] = await pool.query<RowDataPacket>(
    `SELECT a.booking_id, a.patient_id, a.patient_name, a.patient_email, a.patient_type, a.phone_number, a.doctor_name,
            a.department_name, a.visit_type, a.appointment_date, a.preferred_time, a.payment_method, a.status
     FROM patient_appointments a
     LEFT JOIN cashier_integration_events e
       ON e.source_module = 'appointments'
      AND e.source_key = a.booking_id
     WHERE e.id IS NULL
     ORDER BY a.created_at ASC
     LIMIT ?`,
    [Math.max(1, limit)]
  );

  for (const row of missingRows) {
    const bookingId = toSafeText(row.booking_id);
    if (!bookingId) continue;

    await queueCashierIntegrationEvent(pool, {
      sourceModule: 'appointments',
      sourceEntity: 'appointment',
      sourceKey: bookingId,
      patientName: toSafeText(row.patient_name) || null,
      patientType: toSafeText(row.patient_type) || null,
      referenceNo: bookingId,
      amountDue: 0,
      paymentStatus: normalizePaymentStatus(row.payment_status),
      payload: {
        bookingId,
        student_id: toSafeText(row.patient_id) || null,
        patient_id: toSafeText(row.patient_id) || null,
        student_name: toSafeText(row.patient_name) || null,
        patient_email: toSafeText(row.patient_email) || null,
        phone_number: toSafeText(row.phone_number) || null,
        due_date: formatDateCell(row.appointment_date) || currentDateString(),
        created_by: 'Clinic System Backfill',
        fee_type: toSafeText(row.visit_type) || toSafeText(row.department_name) || 'Appointment',
        description: toSafeText(row.visit_type) || toSafeText(row.department_name) || 'Appointment',
        doctorName: toSafeText(row.doctor_name) || null,
        departmentName: toSafeText(row.department_name) || null,
        department_name: toSafeText(row.department_name) || null,
        visitType: toSafeText(row.visit_type) || null,
        program: toSafeText(row.department_name) || null,
        appointmentDate: formatDateCell(row.appointment_date) || null,
        preferredTime: toSafeText(row.preferred_time) || null,
        status: toSafeText(row.status) || null,
        paymentMethod: toSafeText(row.payment_method) || null
      }
    });

    if (cashierIntegrationEnabled(options) && cashierSyncMode(options) === 'auto') {
      const [eventRows] = await pool.query<RowDataPacket>(
        `SELECT *
         FROM cashier_integration_events
         WHERE source_module = 'appointments' AND source_key = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [bookingId]
      );
      if (eventRows[0]) {
        await dispatchCashierEvent(pool, options, eventRows[0]);
      }
    }
  }
}

async function ensureDepartmentClearanceTables(pool: Pool): Promise<void> {
  await ensureClinicIntegrationBootstrap(pool);
}

function departmentIntegrationMap(): Array<{
  key: string;
  name: string;
  stageOrder: number;
  purpose: string;
  recommendedEndpoint: string;
  clinicDataSources: string[];
}> {
  return [
    { key: 'hr', name: 'HR', stageOrder: 1, purpose: 'Employment and staff clearance verification', recommendedEndpoint: '/api/patients', clinicDataSources: ['patient_master', 'module_activity_logs'] },
    { key: 'pmed', name: 'PMED', stageOrder: 2, purpose: 'Evaluation and consolidated inter-department reporting', recommendedEndpoint: '/api/integrations/departments/report?department=pmed', clinicDataSources: ['patient_registrations', 'cashier_payment_links', 'checkup_visits', 'mental_health_sessions', 'laboratory_requests', 'department_clearance_records', 'module_activity_logs'] },
    { key: 'clinic', name: 'Clinic', stageOrder: 3, purpose: 'Receives student/staff identity data and stores medical visits, consultations, health records, and clearances.', recommendedEndpoint: '/api/checkups', clinicDataSources: ['patient_appointments', 'checkup_visits', 'patient_master', 'department_clearance_records'] },
    { key: 'guidance', name: 'Guidance', stageOrder: 4, purpose: 'Behavioral and records validation', recommendedEndpoint: '/api/mental-health', clinicDataSources: ['mental_health_sessions', 'module_activity_logs', 'patient_master'] },
    { key: 'prefect', name: 'Prefect', stageOrder: 5, purpose: 'Discipline clearance validation', recommendedEndpoint: '/api/module-activity', clinicDataSources: ['module_activity_logs', 'patient_master'] },
    { key: 'comlab', name: 'Comlab', stageOrder: 6, purpose: 'Operational and asset clearance', recommendedEndpoint: '/api/module-activity', clinicDataSources: ['module_activity_logs', 'patient_master'] },
    { key: 'crad', name: 'CRAD', stageOrder: 7, purpose: 'Records and documentation validation', recommendedEndpoint: '/api/patients', clinicDataSources: ['patient_master', 'module_activity_logs'] },
    { key: 'cashier', name: 'Cashier', stageOrder: 8, purpose: 'Financial settlement and payment processing', recommendedEndpoint: '/api/integrations/cashier/status', clinicDataSources: ['cashier_integration_events', 'cashier_payment_links'] },
    { key: 'registrar', name: 'Registrar', stageOrder: 9, purpose: 'Final approval and official document release', recommendedEndpoint: '/api/integrations/departments/records', clinicDataSources: ['department_clearance_records', 'patient_master'] },
  ];
}

async function buildDepartmentReport(pool: Pool, departmentKey: string): Promise<Record<string, unknown>> {
  const normalizedKey = toSafeText(departmentKey).toLowerCase();
  const department = departmentIntegrationMap().find((item) => item.key === normalizedKey);
  if (!department) {
    throw new Error('Valid department is required for report generation.');
  }

  const [profileRows] = await pool.query<RowDataPacket>(
    `SELECT department_key, department_name, flow_order, clearance_stage_order, receives, sends, notes, updated_at
     FROM department_flow_profiles
     WHERE department_key = ?
     LIMIT 1`,
    [normalizedKey]
  );
  const seededProfile = DEFAULT_DEPARTMENT_FLOW_PROFILES.find((item) => item.departmentKey === normalizedKey);

  const profile = profileRows[0]
    ? {
        department_key: String(profileRows[0].department_key || department.key),
        department_name: String(profileRows[0].department_name || department.name),
        flow_order: Number(profileRows[0].flow_order || 0),
        clearance_stage_order: Number(profileRows[0].clearance_stage_order || 0),
        receives: Array.isArray(profileRows[0].receives) ? profileRows[0].receives : JSON.parse(String(profileRows[0].receives || '[]')),
        sends: Array.isArray(profileRows[0].sends) ? profileRows[0].sends : JSON.parse(String(profileRows[0].sends || '[]')),
        notes: String(profileRows[0].notes || ''),
        updated_at: formatDateTimeCell(profileRows[0].updated_at)
      }
    : {
        department_key: department.key,
        department_name: department.name,
        flow_order: seededProfile?.flowOrder ?? department.stageOrder,
        clearance_stage_order: seededProfile?.clearanceStageOrder ?? department.stageOrder,
        receives: seededProfile?.receives || [],
        sends: seededProfile?.sends || [],
        notes: seededProfile?.notes || department.purpose,
        updated_at: null
      };

  const [dispatchRows] = await pool.query<RowDataPacket>(
    `SELECT action, detail, actor, entity_key, metadata, created_at
     FROM module_activity_logs
     WHERE module = 'department_reports'
       AND COALESCE(metadata->>'department_key', '') = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    [normalizedKey]
  );

  if (normalizedKey !== 'pmed') {
    const [clearanceRows] = await pool.query<RowDataPacket>(
      `SELECT status, COUNT(*) AS total
       FROM department_clearance_records
       WHERE department_key = ?
       GROUP BY status
       ORDER BY status`,
      [normalizedKey]
    );

    return {
      department,
      profile,
      sections: [
        {
          key: 'clearance_status',
          title: 'Department Clearance Status',
          source: 'department_clearance_records',
          metrics: clearanceRows.map((row) => ({
            label: String(row.status || 'pending'),
            total: Number(row.total || 0)
          }))
        }
      ],
      recent_dispatches: dispatchRows.map((row) => ({
        action: String(row.action || ''),
        detail: String(row.detail || ''),
        actor: String(row.actor || ''),
        entity_key: String(row.entity_key || ''),
        metadata: parseJsonRecord(row.metadata),
        created_at: formatDateTimeCell(row.created_at)
      }))
    };
  }

  const [
    registrationSummaryRows,
    cashierSummaryRows,
    healthSummaryRows,
    counselingSummaryRows,
    laboratorySummaryRows,
    prefectSummaryRows,
    comlabSummaryRows,
    cradSummaryRows,
    hrSummaryRows
  ] = await Promise.all([
    pool.query<RowDataPacket>(
      `SELECT
         COUNT(*) AS total_registrations,
         SUM(CASE WHEN patient_type = 'student' THEN 1 ELSE 0 END) AS student_total,
         SUM(CASE WHEN patient_type = 'teacher' THEN 1 ELSE 0 END) AS teacher_total,
         SUM(CASE WHEN LOWER(status) = 'pending' THEN 1 ELSE 0 END) AS pending_total
       FROM patient_registrations`
    ).then(([rows]) => rows),
    pool.query<RowDataPacket>(
      `SELECT
         COUNT(*) AS total_links,
         COALESCE(SUM(amount_due), 0) AS total_due,
         COALESCE(SUM(amount_paid), 0) AS total_paid,
         COALESCE(SUM(balance_due), 0) AS total_balance,
         SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) AS paid_total,
         SUM(CASE WHEN payment_status = 'partial' THEN 1 ELSE 0 END) AS partial_total,
         SUM(CASE WHEN payment_status = 'unpaid' THEN 1 ELSE 0 END) AS unpaid_total
       FROM cashier_payment_links`
    ).then(([rows]) => rows),
    pool.query<RowDataPacket>(
      `SELECT
         (SELECT COUNT(*) FROM patient_appointments) AS appointment_total,
         (SELECT COUNT(*) FROM checkup_visits) AS checkup_total,
         (SELECT COUNT(*) FROM checkup_visits WHERE status = 'completed') AS completed_checkups,
         (SELECT COUNT(*) FROM checkup_visits WHERE status = 'in_consultation') AS active_consultations,
         (SELECT COUNT(*) FROM checkup_visits WHERE is_emergency = 1) AS emergency_cases`
    ).then(([rows]) => rows),
    pool.query<RowDataPacket>(
      `SELECT
         COUNT(*) AS total_sessions,
         SUM(CASE WHEN status IN ('active', 'follow_up', 'at_risk') THEN 1 ELSE 0 END) AS open_sessions,
         SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) AS high_risk_sessions,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions
       FROM mental_health_sessions`
    ).then(([rows]) => rows),
    pool.query<RowDataPacket>(
      `SELECT
         COUNT(*) AS total_requests,
         SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending_requests,
         SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress_requests,
         SUM(CASE WHEN status IN ('Result Ready', 'Completed') THEN 1 ELSE 0 END) AS finished_requests
       FROM laboratory_requests`
    ).then(([rows]) => rows),
    pool.query<RowDataPacket>(
      `SELECT status, COUNT(*) AS total
       FROM department_clearance_records
       WHERE department_key = 'prefect'
       GROUP BY status
       ORDER BY status`
    ).then(([rows]) => rows),
    pool.query<RowDataPacket>(
      `SELECT status, COUNT(*) AS total
       FROM department_clearance_records
       WHERE department_key = 'comlab'
       GROUP BY status
       ORDER BY status`
    ).then(([rows]) => rows),
    pool.query<RowDataPacket>(
      `SELECT status, COUNT(*) AS total
       FROM department_clearance_records
       WHERE department_key = 'crad'
       GROUP BY status
       ORDER BY status`
    ).then(([rows]) => rows),
    pool.query<RowDataPacket>(
      `SELECT status, COUNT(*) AS total
       FROM department_clearance_records
       WHERE department_key = 'hr'
       GROUP BY status
       ORDER BY status`
    ).then(([rows]) => rows)
  ]);

  const registrationSummary = registrationSummaryRows[0] || {};
  const cashierSummary = cashierSummaryRows[0] || {};
  const healthSummary = healthSummaryRows[0] || {};
  const counselingSummary = counselingSummaryRows[0] || {};
  const laboratorySummary = laboratorySummaryRows[0] || {};

  return {
    department,
    profile,
    sections: [
      {
        key: 'enrollment_statistics',
        title: 'Enrollment Statistics',
        source: 'registrar',
        metrics: [
          { label: 'Total registrations', total: Number(registrationSummary.total_registrations || 0) },
          { label: 'Students', total: Number(registrationSummary.student_total || 0) },
          { label: 'Teachers', total: Number(registrationSummary.teacher_total || 0) },
          { label: 'Pending', total: Number(registrationSummary.pending_total || 0) }
        ]
      },
      {
        key: 'financial_reports',
        title: 'Financial Reports',
        source: 'cashier',
        metrics: [
          { label: 'Billing links', total: Number(cashierSummary.total_links || 0) },
          { label: 'Total due', total: toSafeMoney(cashierSummary.total_due, 0) },
          { label: 'Total paid', total: toSafeMoney(cashierSummary.total_paid, 0) },
          { label: 'Outstanding balance', total: toSafeMoney(cashierSummary.total_balance, 0) },
          { label: 'Paid records', total: Number(cashierSummary.paid_total || 0) },
          { label: 'Partial records', total: Number(cashierSummary.partial_total || 0) },
          { label: 'Unpaid records', total: Number(cashierSummary.unpaid_total || 0) }
        ]
      },
      {
        key: 'health_service_reports',
        title: 'Health Service Reports',
        source: 'clinic',
        metrics: [
          { label: 'Appointments', total: Number(healthSummary.appointment_total || 0) },
          { label: 'Check-up visits', total: Number(healthSummary.checkup_total || 0) },
          { label: 'Completed check-ups', total: Number(healthSummary.completed_checkups || 0) },
          { label: 'Active consultations', total: Number(healthSummary.active_consultations || 0) },
          { label: 'Emergency cases', total: Number(healthSummary.emergency_cases || 0) }
        ]
      },
      {
        key: 'counseling_reports',
        title: 'Counseling Reports',
        source: 'guidance',
        metrics: [
          { label: 'Total sessions', total: Number(counselingSummary.total_sessions || 0) },
          { label: 'Open sessions', total: Number(counselingSummary.open_sessions || 0) },
          { label: 'High risk', total: Number(counselingSummary.high_risk_sessions || 0) },
          { label: 'Completed sessions', total: Number(counselingSummary.completed_sessions || 0) }
        ]
      },
      {
        key: 'discipline_statistics',
        title: 'Discipline Statistics',
        source: 'prefect',
        metrics: prefectSummaryRows.map((row) => ({
          label: String(row.status || 'pending'),
          total: Number(row.total || 0)
        }))
      },
      {
        key: 'laboratory_usage_reports',
        title: 'Laboratory Usage Reports',
        source: 'computer_laboratory',
        metrics: [
          { label: 'Total lab requests', total: Number(laboratorySummary.total_requests || 0) },
          { label: 'Pending', total: Number(laboratorySummary.pending_requests || 0) },
          { label: 'In progress', total: Number(laboratorySummary.in_progress_requests || 0) },
          { label: 'Finished', total: Number(laboratorySummary.finished_requests || 0) },
          ...comlabSummaryRows.map((row) => ({
            label: `Comlab ${String(row.status || 'pending')}`,
            total: Number(row.total || 0)
          }))
        ]
      },
      {
        key: 'program_activity_reports',
        title: 'Program Activity Reports',
        source: 'crad',
        metrics: cradSummaryRows.map((row) => ({
          label: String(row.status || 'pending'),
          total: Number(row.total || 0)
        }))
      },
      {
        key: 'employee_performance_records',
        title: 'Employee Performance Records',
        source: 'hr',
        metrics: hrSummaryRows.map((row) => ({
          label: String(row.status || 'pending'),
          total: Number(row.total || 0)
        }))
      }
    ],
    outgoing_targets: [
      { key: 'school_admin', label: 'School Administration', report_type: 'evaluation_reports' },
      { key: 'hr', label: 'HR Department', report_type: 'staff_evaluation_feedback' }
    ],
    recent_dispatches: dispatchRows.map((row) => ({
      action: String(row.action || ''),
      detail: String(row.detail || ''),
      actor: String(row.actor || ''),
      entity_key: String(row.entity_key || ''),
      metadata: parseJsonRecord(row.metadata),
      created_at: formatDateTimeCell(row.created_at)
    }))
  };
}

async function buildPmedRequiredReportsPackage(pool: Pool): Promise<Record<string, unknown>> {
  const report = await buildDepartmentReport(pool, 'pmed');
  const sections = Array.isArray(report.sections) ? report.sections : [];
  const [deliveryRows] = await pool.query<RowDataPacket>(
    `SELECT action, detail, actor, entity_key, metadata, created_at
     FROM module_activity_logs
     WHERE module = 'department_reports'
       AND COALESCE(metadata->>'target_key', '') = 'pmed'
     ORDER BY created_at DESC
     LIMIT 12`
  );

  const sources = Array.from(
    new Set(
      sections
        .map((section) => toSafeText((section as Record<string, unknown>).source).toLowerCase())
        .filter(Boolean)
    )
  );

  return {
    title: 'PMED Required Reports',
    description: 'Consolidated report package containing only the sections PMED needs for evaluation.',
    sections,
    summary: {
      section_count: sections.length,
      source_count: sources.length,
      metric_count: sections.reduce((total, section) => {
        const metrics = Array.isArray((section as Record<string, unknown>).metrics)
          ? ((section as Record<string, unknown>).metrics as unknown[])
          : [];
        return total + metrics.length;
      }, 0),
      sources
    },
    recent_deliveries: deliveryRows.map((row) => {
      const metadata = parseJsonRecord(row.metadata);
      return {
        action: String(row.action || ''),
        detail: String(row.detail || ''),
        actor: String(row.actor || ''),
        entity_key: String(row.entity_key || ''),
        metadata,
        created_at: resolveReportDeliveryTimestamp(metadata, row.entity_key, row.created_at)
      };
    })
  };
}

async function buildClinicPmedRequestNotifications(pool: Pool): Promise<Record<string, unknown>[]> {
  const [requestRows] = await pool.query<RowDataPacket>(
    `SELECT action, detail, actor, entity_key, metadata, created_at
     FROM module_activity_logs
     WHERE module = 'department_reports'
       AND LOWER(COALESCE(metadata->>'source_department', '')) = 'pmed'
       AND (
         LOWER(COALESCE(metadata->>'target_key', metadata->>'target_department', '')) IN ('reports', 'clinic')
         OR LOWER(COALESCE(metadata->>'notification_scope', '')) = 'clinic_reports'
       )
       AND LOWER(COALESCE(metadata->>'request_status', '')) = 'requested'
     ORDER BY created_at DESC
     LIMIT 12`
  );

  const notifications = requestRows.map((row) => ({
    action: String(row.action || ''),
    detail: String(row.detail || ''),
    actor: String(row.actor || ''),
    entity_key: String(row.entity_key || ''),
    metadata: parseJsonRecord(row.metadata),
    created_at: formatDateTimeCell(row.created_at)
  }));

  const notificationsByKey = new Map<string, Record<string, unknown>>();
  for (const row of notifications) {
    notificationsByKey.set(String(row.entity_key || ''), row);
  }

  try {
    const [fallbackRows] = await pool.query<RowDataPacket>(
      `SELECT report_reference, report_name, report_type, owner_name, delivery_status, generated_at, updated_at, created_at
       FROM public.pmed_reports
       WHERE LOWER(COALESCE(delivery_status, '')) = 'awaiting department'
         AND (
           LOWER(COALESCE(report_type, '')) LIKE 'clinic %'
           OR LOWER(COALESCE(report_name, '')) LIKE '%clinic%'
         )
       ORDER BY COALESCE(generated_at, updated_at, created_at) DESC
       LIMIT 12`
    );

    for (const row of fallbackRows) {
      const entityKey = String(row.report_reference || '');
      if (!entityKey || notificationsByKey.has(entityKey)) continue;
      notificationsByKey.set(entityKey, {
        action: 'PMED Report Requested',
        detail: `PMED requested Clinic to submit ${String(row.report_name || 'a department report')}.`,
        actor: String(row.owner_name || 'PMED Reports'),
        entity_key: entityKey,
        metadata: {
          source_department: 'pmed',
          source_department_name: 'PMED',
          target_department: 'clinic',
          target_department_name: 'Clinic',
          target_key: 'reports',
          request_status: 'requested',
          report_reference: entityKey,
          report_name: String(row.report_name || 'Department Report'),
          report_type: String(row.report_type || 'Clinic Report'),
          stage: 'reporting',
          notification_scope: 'clinic_reports',
          fallback_source: 'pmed_reports'
        },
        created_at: formatDateTimeCell(row.generated_at || row.updated_at || row.created_at)
      });
    }
  } catch {
    // PMED reporting table is optional in some deployments.
  }

  return Array.from(notificationsByKey.values())
    .sort((left, right) => new Date(String(right.created_at || '')).getTime() - new Date(String(left.created_at || '')).getTime())
    .slice(0, 12);
}

async function upsertCashierPaymentLink(
  pool: Pool,
  params: {
    sourceModule: string;
    sourceKey: string;
    cashierReference?: string | null;
    cashierBillingId?: number | null;
    invoiceNumber?: string | null;
    officialReceipt?: string | null;
    amountDue?: number;
    amountPaid?: number;
    balanceDue?: number;
    paymentStatus?: string;
    latestPaymentMethod?: string | null;
    paidAt?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await ensureCashierIntegrationTables(pool);
  await pool.query(
    `INSERT INTO cashier_payment_links (
      source_module, source_key, cashier_reference, cashier_billing_id, invoice_number, official_receipt,
      amount_due, amount_paid, balance_due, payment_status, latest_payment_method, paid_at, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (source_module, source_key) DO UPDATE SET
      cashier_reference = EXCLUDED.cashier_reference,
      cashier_billing_id = EXCLUDED.cashier_billing_id,
      invoice_number = EXCLUDED.invoice_number,
      official_receipt = EXCLUDED.official_receipt,
      amount_due = EXCLUDED.amount_due,
      amount_paid = EXCLUDED.amount_paid,
      balance_due = EXCLUDED.balance_due,
      payment_status = EXCLUDED.payment_status,
      latest_payment_method = EXCLUDED.latest_payment_method,
      paid_at = EXCLUDED.paid_at,
      metadata = EXCLUDED.metadata,
      updated_at = CURRENT_TIMESTAMP`,
    [
      params.sourceModule,
      params.sourceKey,
      params.cashierReference || null,
      params.cashierBillingId == null ? null : toSafeInt(params.cashierBillingId, 0),
      params.invoiceNumber || null,
      params.officialReceipt || null,
      toSafeMoney(params.amountDue, 0),
      toSafeMoney(params.amountPaid, 0),
      toSafeMoney(params.balanceDue, 0),
      normalizePaymentStatus(params.paymentStatus),
      normalizeCashierPaymentMethod(params.latestPaymentMethod),
      toSqlDateTime(params.paidAt),
      JSON.stringify(params.metadata || {})
    ]
  );
}

async function dispatchCashierEvent(
  pool: Pool,
  options: SupabaseApiOptions,
  eventRow: RowDataPacket
): Promise<{ ok: boolean; statusCode?: number; message: string }> {
  const baseUrl = cashierResolvedBaseUrl(options);
  if (!cashierIntegrationEnabled(options)) {
    return { ok: false, message: 'Cashier integration is disabled.' };
  }
  const eventPayload = parseJsonRecord(eventRow.payload);
  const studentId = toSafeText(eventPayload.student_id || eventPayload.patient_id);
  const studentName = toSafeText(eventPayload.student_name || eventRow.patient_name);
  await ensureCashierIntegrationTables(pool);
  try {
    const [existingLinkRows] = await pool.query<RowDataPacket>(
      `SELECT cashier_billing_id, cashier_reference, invoice_number, official_receipt, amount_due, amount_paid, balance_due, payment_status, latest_payment_method, paid_at
       FROM cashier_payment_links
       WHERE source_module = ? AND source_key = ?
       LIMIT 1`,
      [String(eventRow.source_module || ''), String(eventRow.source_key || '')]
    );
    const existingLink = existingLinkRows[0];

    if (cashierUsesInternalSync(options)) {
      const amountDue = Number(eventRow.amount_due || existingLink?.amount_due || 0);
      const paymentStatus = normalizePaymentStatus(existingLink?.payment_status || eventRow.payment_status);
      const amountPaid = paymentStatus === 'paid'
        ? amountDue
        : paymentStatus === 'partial'
          ? Number(existingLink?.amount_paid || 0)
          : Number(existingLink?.amount_paid || 0);
      const balanceDue = paymentStatus === 'paid'
        ? 0
        : Math.max(0, Number(existingLink?.balance_due ?? (amountDue - amountPaid)));

      await upsertCashierPaymentLink(pool, {
        sourceModule: String(eventRow.source_module || ''),
        sourceKey: String(eventRow.source_key || ''),
        cashierReference: toSafeText(existingLink?.cashier_reference) || toSafeText(eventPayload.billing_code) || `SUPA-${toSafeText(eventRow.source_key || '')}`,
        cashierBillingId: toSafeInt(existingLink?.cashier_billing_id, 0) || toSafeInt(eventRow.id, 0) || null,
        invoiceNumber: toSafeText(existingLink?.invoice_number) || toSafeText(eventPayload.billing_code) || null,
        officialReceipt: toSafeText(existingLink?.official_receipt) || null,
        amountDue,
        amountPaid,
        balanceDue,
        paymentStatus,
        latestPaymentMethod: toSafeText(existingLink?.latest_payment_method) || normalizeCashierPaymentMethod(eventPayload.payment_method) || null,
        paidAt: paymentStatus === 'paid'
          ? toSafeText(existingLink?.paid_at) || formatDateTimeCell(eventRow.synced_at || eventRow.updated_at || eventRow.created_at) || new Date().toISOString()
          : toSafeText(existingLink?.paid_at) || null,
        metadata: {
          source: 'supabase_internal_cashier_sync',
          student_id: studentId || null,
          student_name: studentName || null
        }
      });

      if (String(eventRow.source_module || '') === 'appointments') {
        await syncAppointmentCashierColumnsFromLinks(pool, String(eventRow.source_key || ''));
      }

      await pool.query(
        `UPDATE cashier_integration_events
         SET sync_status = 'acknowledged', synced_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [Number(eventRow.id || 0)]
      );
      return { ok: true, statusCode: 200, message: 'Synced through Supabase internal cashier integration.' };
    }

    const studentSyncEndpoint = `${baseUrl}/clinic/student/sync`;
    const billingEndpoint = `${baseUrl}/cashier/billing/create`;
    const headers = {
      'Content-Type': 'application/json',
      ...(toSafeText(options.cashierSharedToken) ? { 'X-Integration-Token': toSafeText(options.cashierSharedToken) } : {})
    };

    if (studentId && studentName) {
      const studentResponse = await fetch(studentSyncEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          student_id: studentId,
          full_name: studentName,
          email: toSafeText(eventPayload.patient_email || ''),
          phone: toSafeText(eventPayload.phone_number || ''),
          course: toSafeText(eventPayload.program || eventPayload.department_name || ''),
          year_level: toSafeText(eventPayload.year_level || ''),
          status: 'active'
        })
      });

      if (!studentResponse.ok) {
        const message = `Cashier student sync responded with ${studentResponse.status}.`;
        await pool.query(
          `UPDATE cashier_integration_events SET sync_status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [message, Number(eventRow.id || 0)]
        );
        return { ok: false, statusCode: studentResponse.status, message };
      }
    }

    let responseStatus = 200;
    if (Number(eventRow.amount_due || 0) > 0 && studentId && studentName && !toSafeInt(existingLink?.cashier_billing_id, 0)) {
      const billingResponse = await fetch(billingEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          student_id: studentId,
          patient_id: toSafeText(eventPayload.patient_id || studentId),
          source_type: String(eventRow.source_entity || 'record'),
          source_module: String(eventRow.source_module || ''),
          source_id: String(eventRow.source_key || ''),
          fee_type: toSafeText(eventPayload.fee_type || eventPayload.visit_type || eventRow.source_entity || 'clinic_fee'),
          description: toSafeText(eventPayload.description || eventPayload.visit_type || eventRow.reference_no || 'Clinic charge'),
          amount: Number(eventRow.amount_due || 0),
          due_date: toSafeText(eventPayload.due_date || formatDateCell(eventRow.created_at) || currentDateString()),
          created_by: toSafeText(eventPayload.created_by || 'Clinic System'),
          student_name: studentName,
          program: toSafeText(eventPayload.program || eventPayload.department_name || ''),
          year_level: toSafeText(eventPayload.year_level || ''),
          metadata: {
            booking_id: toSafeText(eventPayload.bookingId || eventRow.source_key),
            patient_email: toSafeText(eventPayload.patient_email || ''),
            phone_number: toSafeText(eventPayload.phone_number || ''),
            doctor_name: toSafeText(eventPayload.doctorName || ''),
            department_name: toSafeText(eventPayload.departmentName || '')
          }
        })
      });

      responseStatus = billingResponse.status;
      if (!billingResponse.ok) {
        const message = `Cashier billing sync responded with ${billingResponse.status}.`;
        await pool.query(
          `UPDATE cashier_integration_events SET sync_status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [message, Number(eventRow.id || 0)]
        );
        return { ok: false, statusCode: billingResponse.status, message };
      }

      const billingPayload = await billingResponse.json().catch(() => ({} as Record<string, unknown>));
      const billingData = parseJsonRecord((billingPayload as Record<string, unknown>).data);
      await upsertCashierPaymentLink(pool, {
        sourceModule: String(eventRow.source_module || ''),
        sourceKey: String(eventRow.source_key || ''),
        cashierReference: toSafeText(billingData.billing_no) || null,
        cashierBillingId: toSafeInt(billingData.billing_id, 0) || null,
        amountDue: Number(eventRow.amount_due || 0),
        amountPaid: 0,
        balanceDue: Number(eventRow.amount_due || 0),
        paymentStatus: 'unpaid',
        latestPaymentMethod: null,
        metadata: {
          source: 'cashier_billing_create',
          student_id: studentId,
          student_name: studentName
        }
      });
    } else if (existingLink) {
      await upsertCashierPaymentLink(pool, {
        sourceModule: String(eventRow.source_module || ''),
        sourceKey: String(eventRow.source_key || ''),
        cashierReference: toSafeText(existingLink.cashier_reference) || null,
        cashierBillingId: toSafeInt(existingLink.cashier_billing_id, 0) || null,
        amountDue: Number(eventRow.amount_due || existingLink.amount_due || 0),
        amountPaid: Number(existingLink.amount_paid || 0),
        balanceDue: Number(existingLink.balance_due || eventRow.amount_due || 0),
        paymentStatus: toSafeText(existingLink.payment_status) || 'unpaid',
        latestPaymentMethod: toSafeText(existingLink.latest_payment_method) || null,
        paidAt: toSafeText(existingLink.paid_at) || null,
        metadata: {
          source: 'cashier_billing_existing',
          student_id: studentId,
          student_name: studentName
        }
      });
    }

    if (String(eventRow.source_module || '') === 'appointments') {
      await syncAppointmentCashierColumnsFromLinks(pool, String(eventRow.source_key || ''));
    }

    await pool.query(
      `UPDATE cashier_integration_events SET sync_status = 'sent', synced_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [Number(eventRow.id || 0)]
    );
    return { ok: true, statusCode: responseStatus, message: 'Dispatched to cashier system.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cashier dispatch failed.';
    await pool.query(
      `UPDATE cashier_integration_events SET sync_status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [message, Number(eventRow.id || 0)]
    );
    return { ok: false, message };
  }
}

async function ensureDoctorsTable(pool: Pool): Promise<void> {
  // Supabase-only: tables come from `supabase/schema.sql`.
  void pool;
  return;
}

async function ensureDoctorAvailabilityTables(pool: Pool): Promise<void> {
  // Supabase-only: tables come from `supabase/schema.sql`.
  void pool;
  return;
}

async function ensurePatientAppointmentsTable(pool: Pool): Promise<void> {
  // Supabase-only: tables come from `supabase/schema.sql`.
  void pool;
  return;
}

async function ensurePatientRegistrationsTable(pool: Pool): Promise<void> {
  // Supabase-only: tables come from `supabase/schema.sql`.
  void pool;
  return;
}

async function ensurePatientWalkinsTable(pool: Pool): Promise<void> {
  // Supabase-only: tables come from `supabase/schema.sql`.
  void pool;
  return;
}

async function ensureCheckupVisitsTable(pool: Pool): Promise<void> {
  // Supabase-only: tables come from `supabase/schema.sql`.
  void pool;
  return;
}

async function ensureLaboratoryTables(pool: Pool): Promise<void> {
  // Supabase-only: tables come from `supabase/schema.sql`.
  void pool;
  return;
}

async function ensurePharmacyInventoryTables(pool: Pool): Promise<void> {
  // Supabase-only: tables come from `supabase/schema.sql`.
  void pool;
  return;
}

async function ensureMentalHealthTables(pool: Pool): Promise<void> {
  // Supabase-only: tables come from `supabase/schema.sql`.
  void pool;
  return;
}

async function ensurePatientMasterTables(pool: Pool): Promise<void> {
  // Supabase-only: tables come from `supabase/schema.sql`.
  void pool;
  return;
}

async function ensureAdminProfileTables(pool: Pool): Promise<void> {
  // Supabase-only: tables come from `supabase/schema.sql`.
  void pool;
  return;
}

async function getDoctorAvailabilitySnapshot(
  pool: Pool,
  doctorName: string,
  departmentName: string,
  appointmentDate: string,
  preferredTime?: string,
  excludeBookingId?: string
): Promise<Record<string, unknown>> {
  await ensureDoctorAvailabilityTables(pool);
  await ensurePatientAppointmentsTable(pool);

  const requestedDate = toSqlDate(appointmentDate);
  if (!requestedDate) {
    return { doctorName, departmentName, appointmentDate, isDoctorAvailable: false, reason: 'Invalid appointment date.', slots: [], recommendedTimes: [] };
  }

  const dayOfWeek = new Date(`${requestedDate}T00:00:00`).getDay();
  const [slotsRaw] = await pool.query<RowDataPacket>(
    `SELECT id, start_time, end_time, max_appointments
     FROM doctor_availability
     WHERE doctor_name = ? AND department_name = ? AND day_of_week = ? AND is_active = 1
     ORDER BY start_time ASC`,
    [doctorName, departmentName, dayOfWeek]
  );

  const slots = await Promise.all(
    slotsRaw.map(async (slot) => {
      const [countRows] = await pool.query<RowDataPacket>(
        `SELECT COUNT(*) AS total
         FROM patient_appointments
         WHERE doctor_name = ?
           AND department_name = ?
           AND appointment_date = ?
           AND (COALESCE(?, '') = '' OR booking_id <> ?)
           AND (
             preferred_time IS NULL
             OR preferred_time = ''
             OR (
               CAST(NULLIF(preferred_time, '') AS TIME) >= CAST(? AS TIME)
               AND CAST(NULLIF(preferred_time, '') AS TIME) < CAST(? AS TIME)
             )
           )
           AND LOWER(COALESCE(status, '')) <> 'canceled'`,
        [doctorName, departmentName, requestedDate, excludeBookingId || null, excludeBookingId || null, slot.start_time, slot.end_time]
      );
      const booked = Number(countRows[0]?.total || 0);
      const maxAppointments = Number(slot.max_appointments || 0);
      return {
        id: Number(slot.id || 0),
        startTime: String(slot.start_time || '').slice(0, 5),
        endTime: String(slot.end_time || '').slice(0, 5),
        maxAppointments,
        bookedAppointments: booked,
        remainingAppointments: Math.max(0, maxAppointments - booked),
        isOpen: maxAppointments - booked > 0
      };
    })
  );

  const preferred = toSafeText(preferredTime);
  const preferredSlot = preferred ? slots.find((slot) => preferred >= slot.startTime && preferred < slot.endTime) : null;
  const recommendedTimes = slots.filter((slot) => slot.isOpen).map((slot) => slot.startTime);
  const isDoctorAvailable = preferred ? Boolean(preferredSlot?.isOpen) : slots.some((slot) => slot.isOpen);
  const reason = isDoctorAvailable
    ? preferred ? 'Doctor available.' : 'Doctor has available schedule.'
    : preferred ? 'Selected doctor/time slot is already full or unavailable.' : 'Doctor has no remaining available schedule for the selected date.';

  return { doctorName, departmentName, appointmentDate: requestedDate, isDoctorAvailable, reason, slots, recommendedTimes };
}

function mapAppointmentRow(row: RowDataPacket): Record<string, unknown> {
  const patientType = inferPatientType({
    patientType: row.patient_type,
    actorRole: row.actor_role,
    patientName: row.patient_name,
    patientEmail: row.patient_email,
    concern: row.visit_reason || row.symptoms_summary,
    visitType: row.visit_type,
    patientId: row.patient_id,
    age: row.patient_age
  });
  return {
    id: Number(row.id || 0),
    booking_id: String(row.booking_id || ''),
    patient_id: row.patient_id == null ? null : String(row.patient_id),
    patient_name: String(row.patient_name || ''),
    patient_email: row.patient_email == null ? null : String(row.patient_email),
    patient_type: patientType,
    phone_number: String(row.phone_number || ''),
    emergency_contact: row.emergency_contact == null ? null : String(row.emergency_contact),
    insurance_provider: row.insurance_provider == null ? null : String(row.insurance_provider),
    payment_method: row.payment_method == null ? null : String(row.payment_method),
    cashier_billing_id: row.cashier_billing_id == null ? null : Number(row.cashier_billing_id),
    cashier_billing_no: row.cashier_billing_no == null ? (row.cashier_reference == null ? null : String(row.cashier_reference)) : String(row.cashier_billing_no),
    cashier_reference: row.cashier_reference == null ? null : String(row.cashier_reference),
    cashier_payment_status: normalizePaymentStatus(row.cashier_payment_status || row.payment_status),
    cashier_payment_method: normalizeCashierPaymentMethod(row.cashier_payment_method || row.latest_payment_method),
    cashier_can_proceed: toBooleanFlag(row.cashier_can_proceed),
    cashier_verified_at: row.cashier_verified_at == null ? null : formatDateTimeCell(row.cashier_verified_at),
    cashier_sync_status: row.cashier_sync_status == null ? '' : String(row.cashier_sync_status),
    amount_due: Number(row.amount_due || 0),
    amount_paid: Number(row.amount_paid || 0),
    balance_due: Number(row.balance_due || 0),
    official_receipt: row.official_receipt == null ? null : String(row.official_receipt),
    paid_at: row.paid_at == null ? null : formatDateTimeCell(row.paid_at),
    actor_role: String(row.actor_role || 'unknown'),
    appointment_priority: String(row.appointment_priority || 'Routine'),
    doctor_name: String(row.doctor_name || ''),
    service_name: String(row.service_name || row.department_name || 'General Check-Up'),
    department_name: String(row.department_name || ''),
    appointment_date: row.appointment_date instanceof Date ? row.appointment_date.toISOString().slice(0, 10) : String(row.appointment_date || ''),
    preferred_time: row.preferred_time == null ? null : String(row.preferred_time),
    status: String(row.status || ''),
    symptoms_summary: row.symptoms_summary == null ? null : String(row.symptoms_summary),
    doctor_notes: row.doctor_notes == null ? null : String(row.doctor_notes),
    visit_reason: row.visit_reason == null ? null : String(row.visit_reason),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || '')
  };
}

function mapRegistrationRow(row: RowDataPacket): Record<string, unknown> {
  const patientType = inferPatientType({
    patientType: row.patient_type,
    patientName: row.patient_name,
    patientEmail: row.patient_email,
    concern: row.concern,
    age: row.age
  });
  return {
    id: Number(row.id || 0),
    case_id: String(row.case_id || ''),
    patient_name: String(row.patient_name || ''),
    patient_type: patientType,
    patient_email: row.patient_email == null ? '' : String(row.patient_email),
    age: Number(row.age || 0),
    concern: row.concern == null ? '' : String(row.concern),
    intake_time: formatDateTimeCell(row.intake_time),
    booked_time: formatDateTimeCell(row.booked_time),
    status: String(row.status || 'Pending'),
    assigned_to: String(row.assigned_to || 'Unassigned')
  };
}

function mapWalkinRow(row: RowDataPacket): Record<string, unknown> {
  const patientType = inferPatientType({
    patientType: row.patient_type,
    patientName: row.patient_name,
    concern: row.chief_complaint,
    patientId: row.patient_ref,
    age: row.age
  });
  return {
    id: Number(row.id || 0),
    case_id: String(row.case_id || ''),
    patient_name: String(row.patient_name || ''),
    patient_type: patientType,
    age: Number(row.age || 0),
    sex: row.sex == null ? '' : String(row.sex),
    date_of_birth: row.date_of_birth == null ? '' : formatDateCell(row.date_of_birth),
    contact: row.contact == null ? '' : String(row.contact),
    address: row.address == null ? '' : String(row.address),
    emergency_contact: row.emergency_contact == null ? '' : String(row.emergency_contact),
    patient_ref: row.patient_ref == null ? '' : String(row.patient_ref),
    visit_department: row.visit_department == null ? '' : String(row.visit_department),
    checkin_time: row.checkin_time == null ? '' : formatDateTimeCell(row.checkin_time),
    pain_scale: row.pain_scale == null ? null : Number(row.pain_scale),
    temperature_c: row.temperature_c == null ? null : Number(row.temperature_c),
    blood_pressure: row.blood_pressure == null ? '' : String(row.blood_pressure),
    pulse_bpm: row.pulse_bpm == null ? null : Number(row.pulse_bpm),
    weight_kg: row.weight_kg == null ? null : Number(row.weight_kg),
    chief_complaint: row.chief_complaint == null ? '' : String(row.chief_complaint),
    severity: String(row.severity || 'Low'),
    intake_time: formatDateTimeCell(row.intake_time),
    assigned_doctor: String(row.assigned_doctor || 'Nurse Triage'),
    status: String(row.status || 'waiting')
  };
}

function mapCheckupRow(row: RowDataPacket): Record<string, unknown> {
  const patientType = inferPatientType({
    patientType: row.patient_type,
    patientName: row.patient_name,
    concern: row.chief_complaint,
    visitType: row.source
  });
  return {
    id: Number(row.id || 0),
    visit_id: String(row.visit_id || ''),
    patient_name: String(row.patient_name || ''),
    patient_type: patientType,
    assigned_doctor: String(row.assigned_doctor || 'Unassigned'),
    source: String(row.source || 'appointment_confirmed'),
    status: String(row.status || 'intake'),
    chief_complaint: row.chief_complaint == null ? '' : String(row.chief_complaint),
    diagnosis: row.diagnosis == null ? '' : String(row.diagnosis),
    clinical_notes: row.clinical_notes == null ? '' : String(row.clinical_notes),
    consultation_started_at: row.consultation_started_at == null ? '' : formatDateTimeCell(row.consultation_started_at),
    lab_requested: toBooleanFlag(row.lab_requested),
    lab_result_ready: toBooleanFlag(row.lab_result_ready),
    prescription_created: toBooleanFlag(row.prescription_created),
    prescription_dispensed: toBooleanFlag(row.prescription_dispensed),
    follow_up_date: row.follow_up_date == null ? '' : formatDateCell(row.follow_up_date),
    is_emergency: toBooleanFlag(row.is_emergency),
    version: Number(row.version || 1),
    updated_at: formatDateTimeCell(row.updated_at)
  };
}

function mapLabDetailRow(row: RowDataPacket): Record<string, unknown> {
  const patientType = inferPatientType({
    patientType: row.patient_type,
    patientName: row.patient_name,
    patientId: row.patient_id,
    concern: row.category || row.clinical_diagnosis,
    age: row.age
  });
  return {
    request_id: Number(row.request_id || 0),
    visit_id: String(row.visit_id || ''),
    patient_id: String(row.patient_id || ''),
    patient_name: String(row.patient_name || ''),
    patient_type: patientType,
    age: row.age == null ? null : Number(row.age),
    sex: row.sex == null ? '' : String(row.sex),
    category: String(row.category || ''),
    priority: String(row.priority || 'Normal'),
    status: String(row.status || 'Pending'),
    requested_at: formatDateTimeCell(row.requested_at),
    requested_by_doctor: String(row.requested_by_doctor || ''),
    doctor_department: row.doctor_department == null ? '' : String(row.doctor_department),
    notes: row.notes == null ? '' : String(row.notes),
    tests: parseJsonArray(row.tests),
    specimen_type: row.specimen_type == null ? '' : String(row.specimen_type),
    sample_source: row.sample_source == null ? '' : String(row.sample_source),
    collection_date_time: row.collection_date_time == null ? null : formatDateTimeCell(row.collection_date_time),
    clinical_diagnosis: row.clinical_diagnosis == null ? '' : String(row.clinical_diagnosis),
    lab_instructions: row.lab_instructions == null ? '' : String(row.lab_instructions),
    insurance_reference: row.insurance_reference == null ? '' : String(row.insurance_reference),
    billing_reference: row.billing_reference == null ? '' : String(row.billing_reference),
    assigned_lab_staff: row.assigned_lab_staff == null ? '' : String(row.assigned_lab_staff),
    sample_collected: toBooleanFlag(row.sample_collected),
    sample_collected_at: row.sample_collected_at == null ? null : formatDateTimeCell(row.sample_collected_at),
    processing_started_at: row.processing_started_at == null ? null : formatDateTimeCell(row.processing_started_at),
    result_encoded_at: row.result_encoded_at == null ? null : formatDateTimeCell(row.result_encoded_at),
    result_reference_range: row.result_reference_range == null ? '' : String(row.result_reference_range),
    verified_by: row.verified_by == null ? '' : String(row.verified_by),
    verified_at: row.verified_at == null ? null : formatDateTimeCell(row.verified_at),
    rejection_reason: row.rejection_reason == null ? '' : String(row.rejection_reason),
    resample_flag: toBooleanFlag(row.resample_flag),
    released_at: row.released_at == null ? null : formatDateTimeCell(row.released_at),
    raw_attachment_name: row.raw_attachment_name == null ? '' : String(row.raw_attachment_name),
    encoded_values: parseJsonRecord(row.encoded_values)
  };
}

function mapPatientRow(row: RowDataPacket): Record<string, unknown> {
  const patientType = inferPatientType({
    patientType: row.patient_type,
    patientName: row.patient_name,
    patientEmail: row.email,
    patientId: row.patient_code,
    age: row.age
  });
  return {
    id: Number(row.id || 0),
    patient_code: String(row.patient_code || ''),
    patient_name: String(row.patient_name || ''),
    patient_type: patientType,
    email: row.email == null ? null : String(row.email),
    contact: row.contact == null ? null : String(row.contact),
    sex: row.sex == null ? null : String(row.sex),
    date_of_birth: row.date_of_birth == null ? null : formatDateCell(row.date_of_birth),
    age: row.age == null ? null : Number(row.age),
    emergency_contact: row.emergency_contact == null ? null : String(row.emergency_contact),
    guardian_contact: row.guardian_contact == null ? null : String(row.guardian_contact),
    latest_status: String(row.latest_status || ''),
    risk_level: String(row.risk_level || 'low'),
    appointment_count: Number(row.appointment_count || 0),
    walkin_count: Number(row.walkin_count || 0),
    checkup_count: Number(row.checkup_count || 0),
    mental_count: Number(row.mental_count || 0),
    pharmacy_count: Number(row.pharmacy_count || 0),
    source_tags: parseJsonArray(row.source_tags),
    last_seen_at: row.last_seen_at == null ? null : formatDateTimeCell(row.last_seen_at),
    created_at: formatDateTimeCell(row.created_at),
    updated_at: formatDateTimeCell(row.updated_at)
  };
}

async function selectRegistrationById(pool: Pool, id: number): Promise<RowDataPacket | null> {
  const [rows] = await pool.query<RowDataPacket>(
    `SELECT id, case_id, patient_name, patient_type, patient_email, age, concern, intake_time, booked_time, status, assigned_to
     FROM patient_registrations WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function selectWalkinById(pool: Pool, id: number): Promise<RowDataPacket | null> {
  const [rows] = await pool.query<RowDataPacket>(
    `SELECT id, case_id, patient_name, patient_type, age, sex, date_of_birth, contact, address, emergency_contact, patient_ref, visit_department, checkin_time,
            pain_scale, temperature_c, blood_pressure, pulse_bpm, weight_kg, chief_complaint, severity, intake_time, assigned_doctor, status
     FROM patient_walkins WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function selectCheckupById(pool: Pool, id: number): Promise<RowDataPacket | null> {
  const [rows] = await pool.query<RowDataPacket>(
    `SELECT id, visit_id, patient_name, patient_type, assigned_doctor, source, status, chief_complaint, diagnosis, clinical_notes, consultation_started_at,
            lab_requested, lab_result_ready, prescription_created, prescription_dispensed, follow_up_date, is_emergency, version, created_at, updated_at
     FROM checkup_visits WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function rebuildPatientMaster(pool: Pool): Promise<void> {
  await ensurePatientMasterTables(pool);
  await pool.query(`DELETE FROM patient_master`);

  await pool.query(`
    INSERT INTO patient_master (
      patient_code, patient_name, identity_key, patient_type, email, contact, sex, age, emergency_contact, latest_status, risk_level, source_tags, last_seen_at
    )
    SELECT
      seeded.patient_code,
      seeded.patient_name,
      seeded.identity_key,
      seeded.patient_type,
      seeded.email,
      seeded.contact,
      seeded.sex,
      seeded.age,
      seeded.emergency_contact,
      seeded.latest_status,
      seeded.risk_level,
      seeded.source_tags,
      seeded.last_seen_at
    FROM (
      SELECT DISTINCT ON (CONCAT(LOWER(TRIM(a.patient_name)), '|', COALESCE(a.phone_number, '')))
        COALESCE(NULLIF(TRIM(COALESCE(a.patient_id, '')), ''), CONCAT('PAT-A-', a.id)) AS patient_code,
        a.patient_name,
        CASE
          WHEN NULLIF(TRIM(COALESCE(a.patient_id, '')), '') IS NOT NULL THEN LOWER(CONCAT('id:', TRIM(a.patient_id)))
          WHEN NULLIF(TRIM(COALESCE(a.patient_email, '')), '') IS NOT NULL THEN LOWER(CONCAT('email:', TRIM(a.patient_email)))
          WHEN NULLIF(TRIM(COALESCE(a.phone_number, '')), '') IS NOT NULL THEN LOWER(CONCAT('phone:', regexp_replace(TRIM(a.phone_number), '[^0-9]+', '', 'g')))
          ELSE LOWER(CONCAT('name:', TRIM(a.patient_name)))
        END AS identity_key,
        a.patient_type,
        NULLIF(TRIM(COALESCE(a.patient_email, '')), '') AS email,
        NULLIF(TRIM(COALESCE(a.phone_number, '')), '') AS contact,
        NULLIF(TRIM(COALESCE(a.patient_gender, '')), '') AS sex,
        a.patient_age AS age,
        NULLIF(TRIM(COALESCE(a.emergency_contact, '')), '') AS emergency_contact,
        LOWER(COALESCE(a.status, 'pending')) AS latest_status,
        CASE WHEN LOWER(COALESCE(a.appointment_priority, 'routine')) = 'urgent' THEN 'medium' ELSE 'low' END AS risk_level,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM cashier_payment_links p
            WHERE p.source_module = 'appointments'
              AND p.source_key = a.booking_id
          ) OR EXISTS (
            SELECT 1
            FROM cashier_integration_events e
            WHERE e.source_module = 'appointments'
              AND e.source_key = a.booking_id
          ) THEN ARRAY['appointments', 'cashier']::TEXT[]
          ELSE ARRAY['appointments']::TEXT[]
        END AS source_tags,
        COALESCE(a.updated_at, a.created_at, CURRENT_TIMESTAMP) AS last_seen_at
      FROM patient_appointments a
      ORDER BY
        CASE
          WHEN NULLIF(TRIM(COALESCE(a.patient_id, '')), '') IS NOT NULL THEN LOWER(CONCAT('id:', TRIM(a.patient_id)))
          WHEN NULLIF(TRIM(COALESCE(a.patient_email, '')), '') IS NOT NULL THEN LOWER(CONCAT('email:', TRIM(a.patient_email)))
          WHEN NULLIF(TRIM(COALESCE(a.phone_number, '')), '') IS NOT NULL THEN LOWER(CONCAT('phone:', regexp_replace(TRIM(a.phone_number), '[^0-9]+', '', 'g')))
          ELSE LOWER(CONCAT('name:', TRIM(a.patient_name)))
        END,
        COALESCE(a.updated_at, a.created_at, CURRENT_TIMESTAMP) DESC,
        a.id DESC
    ) AS seeded
    ON CONFLICT (identity_key) DO UPDATE
    SET
      patient_code = COALESCE(NULLIF(EXCLUDED.patient_code, ''), patient_master.patient_code),
      patient_name = COALESCE(NULLIF(EXCLUDED.patient_name, ''), patient_master.patient_name),
      patient_type = CASE
        WHEN EXCLUDED.patient_type IN ('student', 'teacher') THEN EXCLUDED.patient_type
        ELSE patient_master.patient_type
      END,
      email = COALESCE(EXCLUDED.email, patient_master.email),
      contact = COALESCE(EXCLUDED.contact, patient_master.contact),
      sex = COALESCE(EXCLUDED.sex, patient_master.sex),
      age = COALESCE(EXCLUDED.age, patient_master.age),
      emergency_contact = COALESCE(EXCLUDED.emergency_contact, patient_master.emergency_contact),
      latest_status = COALESCE(EXCLUDED.latest_status, patient_master.latest_status),
      risk_level = CASE
        WHEN EXCLUDED.risk_level = 'high' THEN 'high'
        WHEN patient_master.risk_level = 'high' THEN 'high'
        WHEN EXCLUDED.risk_level = 'medium' OR patient_master.risk_level = 'medium' THEN 'medium'
        ELSE COALESCE(EXCLUDED.risk_level, patient_master.risk_level)
      END,
      source_tags = ARRAY(
        SELECT DISTINCT tag
        FROM unnest(COALESCE(patient_master.source_tags, ARRAY[]::TEXT[]) || COALESCE(EXCLUDED.source_tags, ARRAY[]::TEXT[])) AS tag
      ),
      last_seen_at = GREATEST(
        COALESCE(patient_master.last_seen_at, TIMESTAMP '1970-01-01'),
        COALESCE(EXCLUDED.last_seen_at, TIMESTAMP '1970-01-01')
      ),
      updated_at = CURRENT_TIMESTAMP
  `);

  await pool.query(`
    INSERT INTO patient_master (
      patient_code, patient_name, identity_key, patient_type, contact, sex, date_of_birth, age, emergency_contact, latest_status, risk_level, source_tags, last_seen_at
    )
    SELECT
      seeded.patient_code,
      seeded.patient_name,
      seeded.identity_key,
      seeded.patient_type,
      seeded.contact,
      seeded.sex,
      seeded.date_of_birth,
      seeded.age,
      seeded.emergency_contact,
      seeded.latest_status,
      seeded.risk_level,
      seeded.source_tags,
      seeded.last_seen_at
    FROM (
      SELECT DISTINCT ON (CONCAT(LOWER(TRIM(w.patient_name)), '|', COALESCE(w.contact, '')))
        COALESCE(NULLIF(TRIM(COALESCE(w.patient_ref, '')), ''), CONCAT('PAT-W-', w.id)) AS patient_code,
        w.patient_name,
        CASE
          WHEN NULLIF(TRIM(COALESCE(w.patient_ref, '')), '') IS NOT NULL THEN LOWER(CONCAT('id:', TRIM(w.patient_ref)))
          WHEN NULLIF(TRIM(COALESCE(w.contact, '')), '') IS NOT NULL THEN LOWER(CONCAT('phone:', regexp_replace(TRIM(w.contact), '[^0-9]+', '', 'g')))
          ELSE LOWER(CONCAT('name:', TRIM(w.patient_name)))
        END AS identity_key,
        w.patient_type,
        NULLIF(TRIM(COALESCE(w.contact, '')), '') AS contact,
        NULLIF(TRIM(COALESCE(w.sex, '')), '') AS sex,
        w.date_of_birth,
        w.age,
        NULLIF(TRIM(COALESCE(w.emergency_contact, '')), '') AS emergency_contact,
        LOWER(COALESCE(w.status, 'waiting')) AS latest_status,
        CASE
          WHEN LOWER(COALESCE(w.severity, 'low')) = 'emergency' THEN 'high'
          WHEN LOWER(COALESCE(w.severity, 'low')) = 'moderate' THEN 'medium'
          ELSE 'low'
        END AS risk_level,
        ARRAY['walkin']::TEXT[] AS source_tags,
        COALESCE(w.updated_at, w.created_at, CURRENT_TIMESTAMP) AS last_seen_at
      FROM patient_walkins w
      ORDER BY
        CASE
          WHEN NULLIF(TRIM(COALESCE(w.patient_ref, '')), '') IS NOT NULL THEN LOWER(CONCAT('id:', TRIM(w.patient_ref)))
          WHEN NULLIF(TRIM(COALESCE(w.contact, '')), '') IS NOT NULL THEN LOWER(CONCAT('phone:', regexp_replace(TRIM(w.contact), '[^0-9]+', '', 'g')))
          ELSE LOWER(CONCAT('name:', TRIM(w.patient_name)))
        END,
        COALESCE(w.updated_at, w.created_at, CURRENT_TIMESTAMP) DESC,
        w.id DESC
    ) AS seeded
    ON CONFLICT (identity_key) DO UPDATE
    SET
      patient_code = COALESCE(NULLIF(EXCLUDED.patient_code, ''), patient_master.patient_code),
      patient_name = COALESCE(NULLIF(EXCLUDED.patient_name, ''), patient_master.patient_name),
      patient_type = CASE
        WHEN EXCLUDED.patient_type IN ('student', 'teacher') THEN EXCLUDED.patient_type
        ELSE patient_master.patient_type
      END,
      contact = COALESCE(EXCLUDED.contact, patient_master.contact),
      sex = COALESCE(EXCLUDED.sex, patient_master.sex),
      date_of_birth = COALESCE(EXCLUDED.date_of_birth, patient_master.date_of_birth),
      age = COALESCE(EXCLUDED.age, patient_master.age),
      emergency_contact = COALESCE(EXCLUDED.emergency_contact, patient_master.emergency_contact),
      latest_status = COALESCE(EXCLUDED.latest_status, patient_master.latest_status),
      risk_level = CASE
        WHEN EXCLUDED.risk_level = 'high' THEN 'high'
        WHEN patient_master.risk_level = 'high' THEN 'high'
        WHEN EXCLUDED.risk_level = 'medium' OR patient_master.risk_level = 'medium' THEN 'medium'
        ELSE COALESCE(EXCLUDED.risk_level, patient_master.risk_level)
      END,
      source_tags = ARRAY(
        SELECT DISTINCT tag
        FROM unnest(COALESCE(patient_master.source_tags, ARRAY[]::TEXT[]) || COALESCE(EXCLUDED.source_tags, ARRAY[]::TEXT[])) AS tag
      ),
      last_seen_at = GREATEST(
        COALESCE(patient_master.last_seen_at, TIMESTAMP '1970-01-01'),
        COALESCE(EXCLUDED.last_seen_at, TIMESTAMP '1970-01-01')
      ),
      updated_at = CURRENT_TIMESTAMP
  `);

  await pool.query(`
    INSERT INTO patient_master (
      patient_code, patient_name, identity_key, patient_type, latest_status, risk_level, source_tags, last_seen_at
    )
    SELECT
      seeded.patient_code,
      seeded.patient_name,
      seeded.identity_key,
      seeded.patient_type,
      seeded.latest_status,
      seeded.risk_level,
      seeded.source_tags,
      seeded.last_seen_at
    FROM (
      SELECT DISTINCT ON (CONCAT(LOWER(TRIM(c.patient_name)), '|'))
        COALESCE(
          (
            SELECT pm.patient_code
            FROM patient_master pm
            WHERE LOWER(TRIM(pm.patient_name)) = LOWER(TRIM(c.patient_name))
            ORDER BY COALESCE(pm.last_seen_at, pm.updated_at, pm.created_at) DESC
            LIMIT 1
          ),
          CONCAT('PAT-C-', c.id)
        ) AS patient_code,
        c.patient_name,
        COALESCE(
          (
            SELECT pm.identity_key
            FROM patient_master pm
            WHERE LOWER(TRIM(pm.patient_name)) = LOWER(TRIM(c.patient_name))
            ORDER BY COALESCE(pm.last_seen_at, pm.updated_at, pm.created_at) DESC
            LIMIT 1
          ),
          LOWER(CONCAT('name:', TRIM(c.patient_name)))
        ) AS identity_key,
        c.patient_type,
        LOWER(COALESCE(c.status, 'intake')) AS latest_status,
        CASE WHEN c.is_emergency = 1 THEN 'high' ELSE 'low' END AS risk_level,
        ARRAY['checkup']::TEXT[] AS source_tags,
        COALESCE(c.updated_at, c.created_at, CURRENT_TIMESTAMP) AS last_seen_at
      FROM checkup_visits c
      ORDER BY
        CONCAT(LOWER(TRIM(c.patient_name)), '|'),
        COALESCE(c.updated_at, c.created_at, CURRENT_TIMESTAMP) DESC,
        c.id DESC
    ) AS seeded
    ON CONFLICT (identity_key) DO UPDATE
    SET
      patient_code = COALESCE(NULLIF(EXCLUDED.patient_code, ''), patient_master.patient_code),
      patient_name = COALESCE(NULLIF(EXCLUDED.patient_name, ''), patient_master.patient_name),
      patient_type = CASE
        WHEN EXCLUDED.patient_type IN ('student', 'teacher') THEN EXCLUDED.patient_type
        ELSE patient_master.patient_type
      END,
      latest_status = COALESCE(EXCLUDED.latest_status, patient_master.latest_status),
      risk_level = CASE
        WHEN EXCLUDED.risk_level = 'high' THEN 'high'
        WHEN patient_master.risk_level = 'high' THEN 'high'
        WHEN EXCLUDED.risk_level = 'medium' OR patient_master.risk_level = 'medium' THEN 'medium'
        ELSE COALESCE(EXCLUDED.risk_level, patient_master.risk_level)
      END,
      source_tags = ARRAY(
        SELECT DISTINCT tag
        FROM unnest(COALESCE(patient_master.source_tags, ARRAY[]::TEXT[]) || COALESCE(EXCLUDED.source_tags, ARRAY[]::TEXT[])) AS tag
      ),
      last_seen_at = GREATEST(
        COALESCE(patient_master.last_seen_at, TIMESTAMP '1970-01-01'),
        COALESCE(EXCLUDED.last_seen_at, TIMESTAMP '1970-01-01')
      ),
      updated_at = CURRENT_TIMESTAMP
  `);

  await pool.query(`
    INSERT INTO patient_master (
      patient_code, patient_name, identity_key, patient_type, contact, sex, date_of_birth, guardian_contact, latest_status, risk_level, source_tags, last_seen_at
    )
    SELECT
      seeded.patient_code,
      seeded.patient_name,
      seeded.identity_key,
      seeded.patient_type,
      seeded.contact,
      seeded.sex,
      seeded.date_of_birth,
      seeded.guardian_contact,
      seeded.latest_status,
      seeded.risk_level,
      seeded.source_tags,
      seeded.last_seen_at
    FROM (
      SELECT DISTINCT ON (CONCAT(LOWER(TRIM(m.patient_name)), '|', COALESCE(m.contact_number, '')))
        m.patient_id AS patient_code,
        m.patient_name,
        CASE
          WHEN NULLIF(TRIM(COALESCE(m.patient_id, '')), '') IS NOT NULL THEN LOWER(CONCAT('id:', TRIM(m.patient_id)))
          WHEN NULLIF(TRIM(COALESCE(m.contact_number, '')), '') IS NOT NULL THEN LOWER(CONCAT('phone:', regexp_replace(TRIM(m.contact_number), '[^0-9]+', '', 'g')))
          ELSE LOWER(CONCAT('name:', TRIM(m.patient_name)))
        END AS identity_key,
        m.patient_type,
        NULLIF(TRIM(COALESCE(m.contact_number, '')), '') AS contact,
        NULLIF(TRIM(COALESCE(m.sex, '')), '') AS sex,
        m.date_of_birth,
        NULLIF(TRIM(COALESCE(m.guardian_contact, '')), '') AS guardian_contact,
        'active' AS latest_status,
        'low' AS risk_level,
        ARRAY['mental']::TEXT[] AS source_tags,
        CURRENT_TIMESTAMP AS last_seen_at
      FROM mental_health_patients m
      ORDER BY
        CASE
          WHEN NULLIF(TRIM(COALESCE(m.patient_id, '')), '') IS NOT NULL THEN LOWER(CONCAT('id:', TRIM(m.patient_id)))
          WHEN NULLIF(TRIM(COALESCE(m.contact_number, '')), '') IS NOT NULL THEN LOWER(CONCAT('phone:', regexp_replace(TRIM(m.contact_number), '[^0-9]+', '', 'g')))
          ELSE LOWER(CONCAT('name:', TRIM(m.patient_name)))
        END,
        m.id DESC
    ) AS seeded
    ON CONFLICT (identity_key) DO UPDATE
    SET
      patient_code = COALESCE(NULLIF(EXCLUDED.patient_code, ''), patient_master.patient_code),
      patient_name = COALESCE(NULLIF(EXCLUDED.patient_name, ''), patient_master.patient_name),
      patient_type = CASE
        WHEN EXCLUDED.patient_type IN ('student', 'teacher') THEN EXCLUDED.patient_type
        ELSE patient_master.patient_type
      END,
      contact = COALESCE(EXCLUDED.contact, patient_master.contact),
      sex = COALESCE(EXCLUDED.sex, patient_master.sex),
      date_of_birth = COALESCE(EXCLUDED.date_of_birth, patient_master.date_of_birth),
      guardian_contact = COALESCE(EXCLUDED.guardian_contact, patient_master.guardian_contact),
      latest_status = COALESCE(EXCLUDED.latest_status, patient_master.latest_status),
      risk_level = CASE
        WHEN EXCLUDED.risk_level = 'high' THEN 'high'
        WHEN patient_master.risk_level = 'high' THEN 'high'
        WHEN EXCLUDED.risk_level = 'medium' OR patient_master.risk_level = 'medium' THEN 'medium'
        ELSE COALESCE(EXCLUDED.risk_level, patient_master.risk_level)
      END,
      source_tags = ARRAY(
        SELECT DISTINCT tag
        FROM unnest(COALESCE(patient_master.source_tags, ARRAY[]::TEXT[]) || COALESCE(EXCLUDED.source_tags, ARRAY[]::TEXT[])) AS tag
      ),
      last_seen_at = GREATEST(
        COALESCE(patient_master.last_seen_at, TIMESTAMP '1970-01-01'),
        COALESCE(EXCLUDED.last_seen_at, TIMESTAMP '1970-01-01')
      ),
      updated_at = CURRENT_TIMESTAMP
  `);

  const [appointmentCounts] = await pool.query<RowDataPacket>(`
    SELECT
      CASE
        WHEN NULLIF(TRIM(COALESCE(patient_id, '')), '') IS NOT NULL THEN LOWER(CONCAT('id:', TRIM(patient_id)))
        WHEN NULLIF(TRIM(COALESCE(patient_email, '')), '') IS NOT NULL THEN LOWER(CONCAT('email:', TRIM(patient_email)))
        WHEN NULLIF(TRIM(COALESCE(phone_number, '')), '') IS NOT NULL THEN LOWER(CONCAT('phone:', regexp_replace(TRIM(phone_number), '[^0-9]+', '', 'g')))
        ELSE LOWER(CONCAT('name:', TRIM(patient_name)))
      END AS identity_key,
      COUNT(*) AS total
    FROM patient_appointments
    GROUP BY 1
  `);
  for (const row of appointmentCounts) {
    await pool.query(`UPDATE patient_master SET appointment_count = ? WHERE identity_key = ?`, [Number(row.total || 0), String(row.identity_key || '')]);
  }
  const [walkinCounts] = await pool.query<RowDataPacket>(`
    SELECT
      CASE
        WHEN NULLIF(TRIM(COALESCE(patient_ref, '')), '') IS NOT NULL THEN LOWER(CONCAT('id:', TRIM(patient_ref)))
        WHEN NULLIF(TRIM(COALESCE(contact, '')), '') IS NOT NULL THEN LOWER(CONCAT('phone:', regexp_replace(TRIM(contact), '[^0-9]+', '', 'g')))
        ELSE LOWER(CONCAT('name:', TRIM(patient_name)))
      END AS identity_key,
      COUNT(*) AS total
    FROM patient_walkins
    GROUP BY 1
  `);
  for (const row of walkinCounts) {
    await pool.query(`UPDATE patient_master SET walkin_count = ? WHERE identity_key = ?`, [Number(row.total || 0), String(row.identity_key || '')]);
  }
  const [checkupCounts] = await pool.query<RowDataPacket>(`
    SELECT LOWER(TRIM(patient_name)) AS patient_name_key, COUNT(*) AS total, MAX(CASE WHEN is_emergency = 1 THEN 1 ELSE 0 END) AS high_risk
    FROM checkup_visits
    GROUP BY 1
  `);
  for (const row of checkupCounts) {
    await pool.query(
      `UPDATE patient_master
       SET checkup_count = ?, risk_level = CASE WHEN ? = 1 THEN 'high' ELSE risk_level END
       WHERE LOWER(TRIM(patient_name)) = ?`,
      [Number(row.total || 0), Number(row.high_risk || 0), String(row.patient_name_key || '')]
    );
  }
  const [mentalCounts] = await pool.query<RowDataPacket>(
    `SELECT
       CASE
         WHEN NULLIF(TRIM(COALESCE(patient_id, '')), '') IS NOT NULL THEN LOWER(CONCAT('id:', TRIM(patient_id)))
         ELSE LOWER(CONCAT('name:', TRIM(patient_name)))
       END AS identity_key,
       COUNT(*) AS total,
       MAX(CASE risk_level WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END) AS risk_rank,
       split_part(string_agg(status, ',' ORDER BY updated_at DESC), ',', 1) AS latest_status
     FROM mental_health_sessions
     GROUP BY 1`
  );
  for (const row of mentalCounts) {
    const riskLevel = Number(row.risk_rank || 1) >= 3 ? 'high' : Number(row.risk_rank || 1) === 2 ? 'medium' : 'low';
    await pool.query(`UPDATE patient_master SET mental_count = ?, risk_level = CASE WHEN ? = 'high' OR risk_level <> 'high' THEN ? ELSE risk_level END, latest_status = COALESCE(?, latest_status) WHERE identity_key = ?`, [Number(row.total || 0), riskLevel, riskLevel, toSafeText(row.latest_status) || null, String(row.identity_key || '')]);
  }
  const [pharmacyCounts] = await pool.query<RowDataPacket>(`
    SELECT LOWER(TRIM(patient_name)) AS patient_name_key, COUNT(*) AS total
    FROM pharmacy_dispense_requests
    GROUP BY 1
  `);
  for (const row of pharmacyCounts) {
    await pool.query(
      `UPDATE patient_master
       SET pharmacy_count = ?
       WHERE LOWER(TRIM(patient_name)) = ?`,
      [Number(row.total || 0), String(row.patient_name_key || '')]
    );
  }
}

/** Dev bypass — always works even if DB row/hash is wrong (clinic management login). */
const CLINIC_DEV_BYPASS_EMAIL = 'admin@gmail.com';
const CLINIC_DEV_BYPASS_PASSWORD = 'admin123';

async function resolveAdminSession(pool: Pool, req: any): Promise<RowDataPacket | null> {
  const cookies = parseCookieHeader(String(req.headers?.cookie || ''));
  const sessionToken = toSafeText(cookies.admin_session);
  if (!sessionToken) return null;
  const sessionHash = createHash('sha256').update(sessionToken).digest('hex');
  const [rows] = await pool.query<RowDataPacket>(
    `SELECT p.id AS admin_profile_id, p.username, p.full_name, p.email, p.role, p.department, p.access_exemptions, p.is_super_admin
     FROM public.admin_sessions s
     JOIN public.admin_profiles p ON p.id = s.admin_profile_id
     WHERE s.session_token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP
       AND LOWER(COALESCE(p.status, '')) = 'active'
     LIMIT 1`,
    [sessionHash]
  );
  return rows[0] || null;
}

function extractIntegrationToken(req: any): string {
  const directHeader = req.headers?.['x-integration-token'];
  const headerToken = Array.isArray(directHeader) ? toSafeText(directHeader[0]) : toSafeText(directHeader);
  if (headerToken) return headerToken;

  const authorization = Array.isArray(req.headers?.authorization)
    ? toSafeText(req.headers.authorization[0])
    : toSafeText(req.headers?.authorization);
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1]?.trim() || '';
}

function secureTokenEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function hasValidDepartmentIntegrationToken(req: any, options: SupabaseApiOptions): boolean {
  const expected = toSafeText(options.departmentSharedToken);
  const actual = extractIntegrationToken(req);
  if (!expected || !actual) return false;
  return secureTokenEquals(actual, expected);
}

function resolveDepartmentActor(
  explicitActor: unknown,
  departmentName: string,
  adminSession: RowDataPacket | null,
  tokenAuthenticated: boolean
): string {
  return (
    toSafeText(explicitActor) ||
    toSafeText(adminSession?.full_name) ||
    toSafeText(adminSession?.username) ||
    (tokenAuthenticated ? `${departmentName} Integration` : '') ||
    departmentName ||
    'System'
  );
}

export function supabaseApiPlugin(options: SupabaseApiOptions): Plugin {
  return {
    name: 'supabase-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '', 'http://localhost');
        let pool: DbPool | null = null;
        try {
          pool = await getPool(options);
        } catch (error) {
          if (['/api/appointments', '/api/doctors', '/api/doctor-availability', '/api/registrations', '/api/walk-ins', '/api/checkups', '/api/laboratory', '/api/pharmacy', '/api/mental-health', '/api/patients', '/api/admin-auth', '/api/admin-profile', '/api/module-activity', '/api/reports', '/api/health-reports', '/api/dashboard', '/api/integrations/cashier/status', '/api/integrations/cashier/queue', '/api/integrations/cashier/sync', '/api/integrations/cashier/payment-status', '/api/integrations/hr-staff/status', '/api/integrations/hr-staff/directory', '/api/integrations/hr-staff/requests', '/api/integrations/departments/map', '/api/integrations/departments/records', '/api/integrations/departments/report', '/api/integrations/prefect/incident-reports', '/api/integrations/prefect/sync-from-registry'].includes(url.pathname)) {
            writeJson(res, 500, { ok: false, message: error instanceof Error ? error.message : 'Supabase connection failed.' });
            return;
          }
          next();
          return;
        }

        if (!pool || !['/api/appointments', '/api/doctors', '/api/doctor-availability', '/api/registrations', '/api/walk-ins', '/api/checkups', '/api/laboratory', '/api/pharmacy', '/api/mental-health', '/api/patients', '/api/admin-auth', '/api/admin-profile', '/api/module-activity', '/api/reports', '/api/health-reports', '/api/dashboard', '/api/integrations/cashier/status', '/api/integrations/cashier/queue', '/api/integrations/cashier/sync', '/api/integrations/cashier/payment-status', '/api/integrations/hr-staff/status', '/api/integrations/hr-staff/directory', '/api/integrations/hr-staff/requests', '/api/integrations/departments/map', '/api/integrations/departments/records', '/api/integrations/departments/report', '/api/integrations/prefect/incident-reports', '/api/integrations/prefect/sync-from-registry'].includes(url.pathname)) {
          next();
          return;
        }

        try {
          if (url.pathname === '/api/doctors') {
            await ensureDoctorsTable(pool);
            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const department = toSafeText(url.searchParams.get('department'));
              const includeInactive = toSafeText(url.searchParams.get('include_inactive')).toLowerCase() === 'true';
              const where: string[] = [];
              const params: unknown[] = [];
              if (department) {
                where.push('department_name = ?');
                params.push(department);
              }
              if (!includeInactive) where.push('is_active = 1');
              const [rows] = await pool.query<RowDataPacket>(
                `SELECT id, doctor_name, department_name, specialization, is_active, created_at, updated_at
                 FROM doctors${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY doctor_name ASC`,
                params
              );
              writeJson(res, 200, { ok: true, data: rows });
              return;
            }
            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const doctorName = toSafeText(body.doctor_name);
              const departmentName = toSafeText(body.department_name);
              if (toSafeText(body.action).toLowerCase() !== 'upsert' || !doctorName || !departmentName) {
                writeJson(res, 422, { ok: false, message: 'doctor_name and department_name are required.' });
                return;
              }
              await pool.query(
                `INSERT INTO doctors (doctor_name, department_name, specialization, is_active)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT (doctor_name) DO UPDATE SET
                   department_name = EXCLUDED.department_name,
                   specialization = EXCLUDED.specialization,
                   is_active = EXCLUDED.is_active`,
                [doctorName, departmentName, toSafeText(body.specialization) || null, body.is_active === false ? 0 : 1]
              );
              const [rows] = await pool.query<RowDataPacket>(
                `SELECT id, doctor_name, department_name, specialization, is_active, created_at, updated_at
                 FROM doctors WHERE doctor_name = ? LIMIT 1`,
                [doctorName]
              );
              writeJson(res, 200, { ok: true, data: rows[0] || null });
              return;
            }
          }

          if (url.pathname === '/api/doctor-availability') {
            await ensureDoctorAvailabilityTables(pool);
            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const mode = toSafeText(url.searchParams.get('mode')).toLowerCase();
              const doctor = normalizeDoctorFilter(toSafeText(url.searchParams.get('doctor')));
              const department = toSafeText(url.searchParams.get('department'));
              const appointmentDate = toSafeText(url.searchParams.get('date'));
              const preferredTime = toSafeText(url.searchParams.get('preferred_time'));

              if (mode === 'raw') {
                const where: string[] = [];
                const params: unknown[] = [];
                if (doctor) {
                  where.push('doctor_name = ?');
                  params.push(doctor);
                }
                if (department) {
                  where.push('department_name = ?');
                  params.push(department);
                }
                const [rows] = await pool.query<RowDataPacket>(
                  `SELECT id, doctor_name, department_name, day_of_week, start_time, end_time, max_appointments, is_active, created_at, updated_at
                   FROM doctor_availability${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
                   ORDER BY doctor_name ASC, day_of_week ASC, start_time ASC`,
                  params
                );
                writeJson(res, 200, { ok: true, data: rows });
                return;
              }

              if (mode === 'times') {
                if (!department || !appointmentDate) {
                  writeJson(res, 422, { ok: false, message: 'department and date are required for times mode.' });
                  return;
                }
                const requestedDate = toSqlDate(appointmentDate);
                if (!requestedDate) {
                  writeJson(res, 422, { ok: false, message: 'date must be a valid ISO date.' });
                  return;
                }
                const dayOfWeek = new Date(`${requestedDate}T00:00:00`).getDay();
                const [doctorRows] = await pool.query<RowDataPacket>(
                  `SELECT DISTINCT doctor_name, department_name
                   FROM doctor_availability
                   WHERE department_name = ? AND is_active = 1 AND day_of_week = ?${doctor ? ' AND doctor_name = ?' : ''}
                   ORDER BY doctor_name ASC`,
                  doctor ? [department, dayOfWeek, doctor] : [department, dayOfWeek]
                );
                const snapshots = await Promise.all(doctorRows.map((row) => getDoctorAvailabilitySnapshot(pool, String(row.doctor_name), String(row.department_name), appointmentDate)));
                const allowedTimes = Array.from(new Set(snapshots.flatMap((item) => (item.recommendedTimes as string[]) || []))).sort();
                writeJson(res, 200, { ok: true, data: { appointmentDate, departmentName: department, allowedTimes, doctors: snapshots } });
                return;
              }

              if (!doctor || !department || !appointmentDate) {
                writeJson(res, 422, { ok: false, message: 'doctor, department, and date are required.' });
                return;
              }
              writeJson(res, 200, { ok: true, data: await getDoctorAvailabilitySnapshot(pool, doctor, department, appointmentDate, preferredTime || undefined) });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const action = toSafeText(body.action).toLowerCase();
              if (action === 'upsert') {
                await pool.query(
                  `INSERT INTO doctor_availability (doctor_name, department_name, day_of_week, start_time, end_time, max_appointments, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (doctor_name, department_name, day_of_week, start_time, end_time) DO UPDATE SET
                     max_appointments = EXCLUDED.max_appointments,
                     is_active = EXCLUDED.is_active,
                     updated_at = CURRENT_TIMESTAMP`,
                  [
                    toSafeText(body.doctor_name),
                    toSafeText(body.department_name),
                    toSafeInt(body.day_of_week, 0),
                    `${toSafeText(body.start_time).slice(0, 5)}:00`,
                    `${toSafeText(body.end_time).slice(0, 5)}:00`,
                    Math.max(1, toSafeInt(body.max_appointments, 8)),
                    body.is_active === false ? 0 : 1
                  ]
                );
                const [rows] = await pool.query<RowDataPacket>(
                  `SELECT id, doctor_name, department_name, day_of_week, start_time, end_time, max_appointments, is_active, created_at, updated_at
                   FROM doctor_availability
                   WHERE doctor_name = ? AND department_name = ? AND day_of_week = ? AND start_time = ? AND end_time = ?
                   LIMIT 1`,
                  [
                    toSafeText(body.doctor_name),
                    toSafeText(body.department_name),
                    toSafeInt(body.day_of_week, 0),
                    `${toSafeText(body.start_time).slice(0, 5)}:00`,
                    `${toSafeText(body.end_time).slice(0, 5)}:00`
                  ]
                );
                writeJson(res, 200, { ok: true, data: rows[0] || null });
                return;
              }
              if (action === 'delete') {
                await pool.query('DELETE FROM doctor_availability WHERE id = ?', [toSafeInt(body.id, 0)]);
                writeJson(res, 200, { ok: true, data: { id: toSafeInt(body.id, 0) } });
                return;
              }
            }
          }

          if (url.pathname === '/api/admin-auth') {
            await ensureAdminProfileTables(pool);

            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const session = await resolveAdminSession(pool, req);
              writeJson(res, 200, {
                ok: true,
                data: {
                  authenticated: Boolean(session),
                  user: session
                    ? {
                        id: Number(session.admin_profile_id || 0),
                        username: String(session.username || ''),
                        fullName: String(session.full_name || ''),
                        email: String(session.email || ''),
                        role: String(session.role || ''),
                        department: String(session.department || ''),
                        accessExemptions: parseJsonArray(session.access_exemptions),
                        isSuperAdmin: toBooleanFlag(session.is_super_admin)
                      }
                    : null
                }
              });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const action = toSafeText(body.action).toLowerCase();
              const appendSetCookie = (cookieValue: string): void => {
                const existing = res.getHeader('Set-Cookie');
                const cookies = Array.isArray(existing) ? existing.concat(cookieValue) : existing ? [String(existing), cookieValue] : [cookieValue];
                res.setHeader('Set-Cookie', cookies);
              };

              if (action === 'logout') {
                const cookies = parseCookieHeader(String(req.headers?.cookie || ''));
                const token = toSafeText(cookies.admin_session);
                if (token) {
                  const tokenHash = createHash('sha256').update(token).digest('hex');
                  await pool.query(
                    `UPDATE public.admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_token_hash = ? AND revoked_at IS NULL`,
                    [tokenHash]
                  );
                }
                appendSetCookie('admin_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/');
                writeJson(res, 200, { ok: true, message: 'Signed out.' });
                return;
              }

              if (action === 'login') {
                const username = toSafeText(body.username).toLowerCase();
                const password = toSafeText(body.password);
                if (!username || !password) {
                  writeJson(res, 422, { ok: false, message: 'Username and password are required.' });
                  return;
                }
                const bypass =
                  username === CLINIC_DEV_BYPASS_EMAIL.toLowerCase() && password === CLINIC_DEV_BYPASS_PASSWORD;

                let [rows] = await pool.query<RowDataPacket>(
                  `SELECT id, username, full_name, email, role, department, access_exemptions, is_super_admin, status, password_hash
                   FROM public.admin_profiles
                   WHERE LOWER(username) = ? OR LOWER(email) = ?
                   LIMIT 1`,
                  [username, username]
                );
                let account = rows[0];

                if (bypass && !account) {
                  await pool.query(
                    `INSERT INTO public.admin_profiles (username, full_name, email, role, department, access_exemptions, is_super_admin, password_hash, status, phone)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        'cashier_integration',
                      ]),
                      1,
                      hashPassword(CLINIC_DEV_BYPASS_PASSWORD),
                      'active',
                      '',
                    ]
                  );
                  const [again] = await pool.query<RowDataPacket>(
                    `SELECT id, username, full_name, email, role, department, access_exemptions, is_super_admin, status, password_hash
                     FROM public.admin_profiles
                     WHERE LOWER(username) = ? OR LOWER(email) = ?
                     LIMIT 1`,
                    [username, username]
                  );
                  account = again[0];
                }

                const passwordOk =
                  bypass ||
                  Boolean(
                    account &&
                      toSafeText(account.password_hash) &&
                      verifyPassword(password, String(account.password_hash || ''))
                  );

                if (!account || toSafeText(account.status).toLowerCase() !== 'active' || !passwordOk) {
                  writeJson(res, 401, { ok: false, message: 'Invalid credentials.' });
                  return;
                }
                const sessionToken = randomBytes(32).toString('hex');
                const sessionHash = createHash('sha256').update(sessionToken).digest('hex');
                await pool.query(
                  `INSERT INTO public.admin_sessions (session_token_hash, admin_profile_id, ip_address, user_agent, expires_at)
                   VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '12 hours')`,
                  [sessionHash, Number(account.id || 0), '127.0.0.1', String(req.headers['user-agent'] || '')]
                );
                await pool.query(`UPDATE public.admin_profiles SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, [
                  Number(account.id || 0),
                ]);
                await pool.query(`INSERT INTO admin_activity_logs (username, action, raw_action, description, ip_address) VALUES (?, 'Login', 'LOGIN', 'Admin signed in.', '127.0.0.1')`, [String(account.username || '')]);
                appendSetCookie(`admin_session=${sessionToken}; Max-Age=${60 * 60 * 12}; HttpOnly; SameSite=Lax; Path=/`);
                writeJson(res, 200, {
                  ok: true,
                  data: {
                    user: {
                      id: Number(account.id || 0),
                      username: String(account.username || ''),
                      fullName: String(account.full_name || ''),
                      email: String(account.email || ''),
                      role: String(account.role || ''),
                      department: String(account.department || ''),
                      accessExemptions: parseJsonArray(account.access_exemptions),
                      isSuperAdmin: toBooleanFlag(account.is_super_admin)
                    }
                  }
                });
                return;
              }

              if (action === 'create_account') {
                const actor = await resolveAdminSession(pool, req);
                if (!actor || !toBooleanFlag(actor.is_super_admin)) {
                  writeJson(res, 403, { ok: false, message: 'Only super admin can create admin accounts.' });
                  return;
                }
                const username = toSafeText(body.username).toLowerCase();
                const email = toSafeText(body.email).toLowerCase();
                const fullName = toSafeText(body.full_name);
                const password = toSafeText(body.password);
                if (!username || !email || !fullName || password.length < 8) {
                  writeJson(res, 422, { ok: false, message: 'Full name, username, email, and password (min 8 chars) are required.' });
                  return;
                }
                const [existingRows] = await pool.query<RowDataPacket>(
                  `SELECT id FROM public.admin_profiles WHERE LOWER(username) = ? OR LOWER(email) = ? LIMIT 1`,
                  [username, email]
                );
                if (existingRows[0]) {
                  writeJson(res, 409, { ok: false, message: 'Admin account already exists for this username/email.' });
                  return;
                }
                await pool.query(
                  `INSERT INTO public.admin_profiles (username, full_name, email, role, department, access_exemptions, is_super_admin, password_hash, status, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    username,
                    fullName,
                    email,
                    toSafeText(body.role) || 'Admin',
                    toSafeText(body.department) || 'Administration',
                    JSON.stringify(Array.isArray(body.access_exemptions) ? body.access_exemptions : []),
                    toBooleanFlag(body.is_super_admin) ? 1 : 0,
                    hashPassword(password),
                    toSafeText(body.status) || 'active',
                    toSafeText(body.phone) || '',
                  ]
                );
                await pool.query(`INSERT INTO admin_activity_logs (username, action, raw_action, description, ip_address) VALUES (?, 'Account Created', 'ACCOUNT_CREATED', ?, '127.0.0.1')`, [String(actor.username || ''), `Created admin account ${username}`]);
                writeJson(res, 200, { ok: true, message: 'Admin account created.' });
                return;
              }

              writeJson(res, 422, { ok: false, message: 'Unsupported admin auth action.' });
              return;
            }
          }

          if (url.pathname === '/api/admin-profile') {
            await ensureAdminProfileTables(pool);
            const adminSession = await resolveAdminSession(pool, req);
            if (!adminSession) {
              writeJson(res, 401, { ok: false, message: 'Admin authentication required.' });
              return;
            }

            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const requestedUsername = toSafeText(url.searchParams.get('username')).toLowerCase();
              const username = requestedUsername && toBooleanFlag(adminSession.is_super_admin) ? requestedUsername : String(adminSession.username || '').toLowerCase();
              const [profileRows] = await pool.query<RowDataPacket>(
                `SELECT username, full_name, email, role, department, is_super_admin, status, phone, created_at, last_login_at, email_notifications, in_app_notifications, dark_mode FROM public.admin_profiles WHERE username = ? LIMIT 1`,
                [username]
              );
              const profile = profileRows[0];
              if (!profile) {
                writeJson(res, 404, { ok: false, message: 'Admin profile not found.' });
                return;
              }
              const [logs] = await pool.query<RowDataPacket>(`SELECT action, raw_action, description, ip_address, created_at FROM admin_activity_logs WHERE username = ? ORDER BY created_at DESC LIMIT 50`, [username]);
              writeJson(res, 200, {
                ok: true,
                data: {
                  profile: {
                    fullName: String(profile.full_name || ''),
                    username: String(profile.username || ''),
                    email: String(profile.email || ''),
                    role: String(profile.role || ''),
                    department: String(profile.department || 'Administration'),
                    isSuperAdmin: toBooleanFlag(profile.is_super_admin),
                    status: String(profile.status || ''),
                    phone: String(profile.phone || ''),
                    createdAt: formatDateTimeCell(profile.created_at),
                    lastLoginAt: formatDateTimeCell(profile.last_login_at)
                  },
                  preferences: {
                    emailNotifications: toBooleanFlag(profile.email_notifications),
                    inAppNotifications: toBooleanFlag(profile.in_app_notifications),
                    darkMode: toBooleanFlag(profile.dark_mode)
                  },
                  stats: {
                    totalLogins: logs.filter((item) => String(item.raw_action || '') === 'LOGIN').length,
                    status: String(profile.status || '').toUpperCase()
                  },
                  activityLogs: logs.map((item) => ({ dateTime: formatDateTimeCell(item.created_at), action: String(item.action || ''), rawAction: String(item.raw_action || ''), description: String(item.description || ''), ipAddress: String(item.ip_address || '') })),
                  loginHistory: logs.filter((item) => ['LOGIN', 'LOGOUT'].includes(String(item.raw_action || ''))).map((item) => ({ dateTime: formatDateTimeCell(item.created_at), action: String(item.action || ''), rawAction: String(item.raw_action || ''), description: String(item.description || ''), ipAddress: String(item.ip_address || '') }))
                }
              });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const requestedUsername = toSafeText(body.username).toLowerCase();
              const username = requestedUsername && toBooleanFlag(adminSession.is_super_admin) ? requestedUsername : String(adminSession.username || '').toLowerCase();
              const preferences = (body.preferences || {}) as Record<string, unknown>;
              await pool.query(
                `UPDATE public.admin_profiles SET full_name = COALESCE(NULLIF(?, ''), full_name), phone = COALESCE(NULLIF(?, ''), phone), email_notifications = COALESCE(?, email_notifications), in_app_notifications = COALESCE(?, in_app_notifications), dark_mode = COALESCE(?, dark_mode) WHERE username = ?`,
                [
                  toSafeText(body.full_name) || null,
                  toSafeText(body.phone) || null,
                  preferences.emailNotifications == null ? null : toBooleanFlag(preferences.emailNotifications) ? 1 : 0,
                  preferences.inAppNotifications == null ? null : toBooleanFlag(preferences.inAppNotifications) ? 1 : 0,
                  preferences.darkMode == null ? null : toBooleanFlag(preferences.darkMode) ? 1 : 0,
                  username,
                ]
              );
              await pool.query(`INSERT INTO admin_activity_logs (username, action, raw_action, description, ip_address) VALUES (?, 'Profile Updated', 'PROFILE_UPDATED', 'Profile settings updated.', '127.0.0.1')`, [username]);
              writeJson(res, 200, { ok: true });
              return;
            }
          }

          if (url.pathname === '/api/integrations/cashier/status' && (req.method || 'GET').toUpperCase() === 'GET') {
            await ensureCashierIntegrationTables(pool);
            const [queueRows] = await pool.query<RowDataPacket>(
              `SELECT
                 SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) AS pending_total,
                 SUM(CASE WHEN sync_status = 'sent' THEN 1 ELSE 0 END) AS sent_total,
                 SUM(CASE WHEN sync_status = 'acknowledged' THEN 1 ELSE 0 END) AS acknowledged_total,
                 SUM(CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END) AS failed_total
               FROM cashier_integration_events`
            );
            const [recentEvents] = await pool.query<RowDataPacket>(
              `SELECT id, source_module, source_entity, source_key, patient_name, patient_type, reference_no, amount_due, currency_code, payment_status, sync_status, last_error, synced_at, created_at
               FROM cashier_integration_events
               ORDER BY created_at DESC
               LIMIT 12`
            );
            const [recentPayments] = await pool.query<RowDataPacket>(
              `SELECT id, source_module, source_key, cashier_reference, cashier_billing_id, invoice_number, official_receipt, amount_due, amount_paid, balance_due, payment_status, latest_payment_method, paid_at, updated_at
               FROM cashier_payment_links
               ORDER BY updated_at DESC
               LIMIT 12`
            );
            writeJson(res, 200, {
              ok: true,
              data: {
                enabled: cashierIntegrationEnabled(options),
                syncMode: cashierSyncMode(options),
                baseUrl: cashierResolvedBaseUrl(options),
                inboundPath: cashierResolvedInboundPath(options),
                queue: {
                  pending: Number(queueRows[0]?.pending_total || 0),
                  sent: Number(queueRows[0]?.sent_total || 0),
                  acknowledged: Number(queueRows[0]?.acknowledged_total || 0),
                  failed: Number(queueRows[0]?.failed_total || 0)
                },
                recentEvents: recentEvents.map((row) => ({
                  ...row,
                  patient_type: inferPatientType({
                    patientType: row.patient_type,
                    patientName: row.patient_name,
                    patientId: row.reference_no,
                    concern: row.source_module
                  }),
                  amount_due: Number(row.amount_due || 0),
                  created_at: formatDateTimeCell(row.created_at),
                  synced_at: row.synced_at == null ? null : formatDateTimeCell(row.synced_at)
                })),
                recentPayments: recentPayments.map((row) => ({
                  ...row,
                  amount_due: Number(row.amount_due || 0),
                  amount_paid: Number(row.amount_paid || 0),
                  balance_due: Number(row.balance_due || 0),
                  paid_at: row.paid_at == null ? null : formatDateTimeCell(row.paid_at),
                  updated_at: formatDateTimeCell(row.updated_at)
                }))
              }
            });
            return;
          }

          if (url.pathname === '/api/integrations/cashier/queue' && (req.method || 'GET').toUpperCase() === 'GET') {
            await ensureCashierIntegrationTables(pool);
            const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
            const perPage = Math.min(50, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 10)));
            const offset = (page - 1) * perPage;
            const syncStatus = toSafeText(url.searchParams.get('sync_status')).toLowerCase();
            const sourceModule = toSafeText(url.searchParams.get('source_module')).toLowerCase();
            const where: string[] = [];
            const params: unknown[] = [];
            if (syncStatus) {
              where.push('LOWER(sync_status) = ?');
              params.push(syncStatus);
            }
            if (sourceModule) {
              where.push('LOWER(source_module) = ?');
              params.push(sourceModule);
            }
            const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
            const [countRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM cashier_integration_events${whereSql}`, params);
            const total = Number(countRows[0]?.total || 0);
            const [rows] = await pool.query<RowDataPacket>(
              `SELECT id, source_module, source_entity, source_key, patient_name, patient_type, reference_no, amount_due, currency_code, payment_status, sync_status, last_error, synced_at, created_at, updated_at
               FROM cashier_integration_events${whereSql}
               ORDER BY created_at DESC
               LIMIT ? OFFSET ?`,
              [...params, perPage, offset]
            );
            writeJson(res, 200, {
              ok: true,
              data: {
                items: rows.map((row) => ({
                  ...row,
                  patient_type: inferPatientType({
                    patientType: row.patient_type,
                    patientName: row.patient_name,
                    patientId: row.reference_no,
                    concern: row.source_module
                  }),
                  amount_due: Number(row.amount_due || 0),
                  created_at: formatDateTimeCell(row.created_at),
                  updated_at: formatDateTimeCell(row.updated_at),
                  synced_at: row.synced_at == null ? null : formatDateTimeCell(row.synced_at)
                })),
                meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) }
              }
            });
            return;
          }

          if (url.pathname === '/api/integrations/cashier/sync' && (req.method || '').toUpperCase() === 'POST') {
            await ensureCashierIntegrationTables(pool);
            const body = await readJsonBody(req);
            const action = toSafeText(body.action).toLowerCase();

            if (action === 'dispatch_pending' || action === 'acknowledge') {
              const adminSession = await resolveAdminSession(pool, req);
              if (!adminSession) {
                writeJson(res, 401, { ok: false, message: 'Admin authentication required.' });
                return;
              }
              if (!canManageCashierFinancials(adminSession)) {
                writeJson(res, 403, { ok: false, message: 'Only cashier or finance-authorized admins can update cashier sync actions.' });
                return;
              }
            }

            if (action === 'enqueue') {
              const sourceModule = toSafeText(body.source_module);
              const sourceEntity = toSafeText(body.source_entity) || 'record';
              const sourceKey = toSafeText(body.source_key);
              if (!sourceModule || !sourceKey) {
                writeJson(res, 422, { ok: false, message: 'source_module and source_key are required.' });
                return;
              }
              await queueCashierIntegrationEvent(pool, {
                sourceModule,
                sourceEntity,
                sourceKey,
                patientName: toSafeText(body.patient_name) || null,
                patientType: toSafeText(body.patient_type) || null,
                referenceNo: toSafeText(body.reference_no) || sourceKey,
                amountDue: toSafeMoney(body.amount_due, 0),
                paymentStatus: toSafeText(body.payment_status) || 'unpaid',
                payload: parseJsonRecord(body.payload)
              });
              await insertModuleActivity(pool, 'cashier_integration', 'Cashier Sync Enqueued', `Queued ${sourceModule} ${sourceKey} for cashier sync.`, toSafeText(body.actor) || 'System', sourceEntity, sourceKey);
              writeJson(res, 200, { ok: true, message: 'Cashier sync queued.' });
              return;
            }

            if (action === 'dispatch_pending') {
              const limit = Math.min(25, Math.max(1, toSafeInt(body.limit, 10)));
              const eventId = toSafeInt(body.event_id, 0);
              const [rows] = await pool.query<RowDataPacket>(
                `SELECT * FROM cashier_integration_events
                 WHERE ${eventId > 0 ? 'id = ?' : `sync_status = 'pending'`}
                 ORDER BY created_at ASC
                 LIMIT ?`,
                eventId > 0 ? [eventId, limit] : [limit]
              );
              const results: Array<Record<string, unknown>> = [];
              for (const row of rows) {
                const result = await dispatchCashierEvent(pool, options, row);
                results.push({ id: Number(row.id || 0), source_key: String(row.source_key || ''), ...result });
              }
              writeJson(res, 200, {
                ok: true,
                data: {
                  enabled: cashierIntegrationEnabled(options),
                  processed: results.length,
                  results
                }
              });
              return;
            }

            if (action === 'acknowledge') {
              const eventId = toSafeInt(body.event_id, 0);
              if (!eventId) {
                writeJson(res, 422, { ok: false, message: 'event_id is required.' });
                return;
              }
              await pool.query(
                `UPDATE cashier_integration_events SET sync_status = 'acknowledged', last_error = NULL, synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [eventId]
              );
              writeJson(res, 200, { ok: true, message: 'Cashier event acknowledged.' });
              return;
            }

            writeJson(res, 422, { ok: false, message: 'Unsupported cashier sync action.' });
            return;
          }

          if (url.pathname === '/api/integrations/cashier/payment-status' && (req.method || '').toUpperCase() === 'POST') {
            await ensureCashierIntegrationTables(pool);
            const adminSession = await resolveAdminSession(pool, req);
            if (!adminSession) {
              writeJson(res, 401, { ok: false, message: 'Admin authentication required.' });
              return;
            }
            if (!canManageCashierFinancials(adminSession)) {
              writeJson(res, 403, { ok: false, message: 'Only cashier or finance-authorized admins can edit payment records.' });
              return;
            }
            const body = await readJsonBody(req);
            const sourceModule = toSafeText(body.source_module);
            const sourceKey = toSafeText(body.source_key);
            if (!sourceModule || !sourceKey) {
              writeJson(res, 422, { ok: false, message: 'source_module and source_key are required.' });
              return;
            }
            const amountDue = toSafeMoney(body.amount_due, 0);
            const amountPaid = toSafeMoney(body.amount_paid, 0);
            const normalizedPaymentStatus = normalizePaymentStatus(body.payment_status);
            const derivedBalanceDue = Math.max(0, Number((amountDue - amountPaid).toFixed(2)));

            if (amountDue < 0 || amountPaid < 0) {
              writeJson(res, 422, { ok: false, message: 'Amount due and amount paid cannot be negative.' });
              return;
            }
            if (amountPaid > amountDue && amountDue > 0) {
              writeJson(res, 422, { ok: false, message: 'Amount paid cannot be greater than amount due.' });
              return;
            }
            if (normalizedPaymentStatus === 'unpaid' && amountPaid > 0) {
              writeJson(res, 422, { ok: false, message: 'Use partial or paid when payment has already been collected.' });
              return;
            }
            if (normalizedPaymentStatus === 'partial' && (amountPaid <= 0 || derivedBalanceDue <= 0)) {
              writeJson(res, 422, { ok: false, message: 'Partial payments require collected amount greater than zero and a remaining balance.' });
              return;
            }
            if (normalizedPaymentStatus === 'paid' && derivedBalanceDue > 0) {
              writeJson(res, 422, { ok: false, message: 'Paid status requires the balance due to be zero.' });
              return;
            }
            if (normalizedPaymentStatus === 'paid' && amountDue > 0 && amountPaid < amountDue) {
              writeJson(res, 422, { ok: false, message: 'Paid status requires amount paid to match amount due.' });
              return;
            }
            if (normalizedPaymentStatus === 'paid' && !toSafeText(body.official_receipt)) {
              writeJson(res, 422, { ok: false, message: 'Official receipt is required before marking a payment as paid.' });
              return;
            }
              await upsertCashierPaymentLink(pool, {
                sourceModule,
                sourceKey,
                cashierReference: toSafeText(body.cashier_reference) || null,
                cashierBillingId: toSafeInt(body.cashier_billing_id, 0) || null,
              invoiceNumber: toSafeText(body.invoice_number) || null,
              officialReceipt: toSafeText(body.official_receipt) || null,
              amountDue,
              amountPaid,
              balanceDue: derivedBalanceDue,
              paymentStatus: normalizedPaymentStatus,
              latestPaymentMethod: toSafeText(body.latest_payment_method || body.payment_method) || null,
                paidAt: normalizedPaymentStatus === 'paid' ? (toSafeText(body.paid_at) || new Date().toISOString()) : toSafeText(body.paid_at) || null,
                metadata: parseJsonRecord(body.metadata)
              });
              if (sourceModule === 'appointments') {
                await syncAppointmentCashierColumnsFromLinks(pool, sourceKey);
              }
              await pool.query(
                `UPDATE cashier_integration_events
                 SET payment_status = ?, sync_status = ?, last_error = NULL, updated_at = CURRENT_TIMESTAMP
               WHERE source_module = ? AND source_key = ?`,
              [
                normalizedPaymentStatus,
                normalizedPaymentStatus === 'paid' ? 'acknowledged' : 'sent',
                sourceModule,
                sourceKey
              ]
            );
            await insertModuleActivity(pool, 'cashier_integration', 'Cashier Payment Status Updated', `Received cashier payment status for ${sourceModule} ${sourceKey}.`, toSafeText(body.actor) || toSafeText(adminSession.full_name) || toSafeText(adminSession.username) || 'Cashier', 'cashier_payment', sourceKey, {
              paymentStatus: normalizedPaymentStatus,
              amountPaid,
              amountDue,
              balanceDue: derivedBalanceDue,
              officialReceipt: toSafeText(body.official_receipt) || null
            });
            writeJson(res, 200, { ok: true, message: 'Cashier payment status recorded.' });
            return;
          }

          if (url.pathname === '/api/integrations/hr-staff/status' && (req.method || 'GET').toUpperCase() === 'GET') {
            await ensureHrStaffRequestTables(pool);
            const [totalsRows] = await pool.query<RowDataPacket>(
              `SELECT
                 SUM(CASE WHEN LOWER(employment_status) = 'active' THEN 1 ELSE 0 END) AS active_roster,
                 SUM(CASE WHEN LOWER(employment_status) = 'working' THEN 1 ELSE 0 END) AS working_roster
               FROM public.hr_staff_directory
               WHERE LOWER(role_type) IN ('doctor', 'nurse')`
            );
            const [requestRows] = await pool.query<RowDataPacket>(
              `SELECT
                 SUM(CASE WHEN LOWER(request_status) = 'pending' THEN 1 ELSE 0 END) AS pending_requests,
                 SUM(CASE WHEN LOWER(request_status) = 'approved' THEN 1 ELSE 0 END) AS approved_requests
               FROM public.hr_staff_requests`
            );
            const [recentRows] = await pool.query<RowDataPacket>(
              `SELECT
                 r.id, r.request_reference, r.staff_id, s.employee_no,
                 s.full_name AS staff_name, s.role_type, s.department_name,
                 r.request_status, r.request_notes, r.requested_by, r.decided_by,
                 r.decided_at, r.created_at, r.updated_at
               FROM public.hr_staff_requests r
               INNER JOIN public.hr_staff_directory s ON s.id = r.staff_id
               ORDER BY r.created_at DESC
               LIMIT 10`
            );
            writeJson(res, 200, {
              ok: true,
              data: {
                totals: {
                  activeRoster: Number(totalsRows[0]?.active_roster || 0),
                  workingRoster: Number(totalsRows[0]?.working_roster || 0),
                  pendingRequests: Number(requestRows[0]?.pending_requests || 0),
                  approvedRequests: Number(requestRows[0]?.approved_requests || 0)
                },
                recentRequests: recentRows.map((row) => ({
                  ...row,
                  created_at: formatDateTimeCell(row.created_at),
                  updated_at: formatDateTimeCell(row.updated_at),
                  decided_at: row.decided_at == null ? null : formatDateTimeCell(row.decided_at)
                }))
              }
            });
            return;
          }

          if (url.pathname === '/api/integrations/hr-staff/directory' && (req.method || 'GET').toUpperCase() === 'GET') {
            await ensureHrStaffRequestTables(pool);
            const search = toSafeText(url.searchParams.get('search')).toLowerCase();
            const role = toSafeText(url.searchParams.get('role')).toLowerCase();
            const employmentStatus = toSafeText(url.searchParams.get('employment_status')).toLowerCase();
            const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
            const perPage = Math.min(50, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 8)));
            const offset = (page - 1) * perPage;
            const where: string[] = [`LOWER(role_type) IN ('doctor', 'nurse')`];
            const params: unknown[] = [];
            if (search) {
              const like = `%${search}%`;
              where.push('(LOWER(employee_no) LIKE ? OR LOWER(full_name) LIKE ?)');
              params.push(like, like);
            }
            if (role) {
              where.push('LOWER(role_type) = ?');
              params.push(role);
            }
            if (employmentStatus) {
              where.push('LOWER(employment_status) = ?');
              params.push(employmentStatus);
            }
            const whereSql = ` WHERE ${where.join(' AND ')}`;
            const [countRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM public.hr_staff_directory${whereSql}`, params);
            const total = Number(countRows[0]?.total || 0);
            const [rows] = await pool.query<RowDataPacket>(
              `SELECT id, employee_no, full_name, role_type, department_name, employment_status, contact_email, contact_phone, hired_at, updated_at
               FROM public.hr_staff_directory${whereSql}
               ORDER BY full_name ASC
               LIMIT ? OFFSET ?`,
              [...params, perPage, offset]
            );
            writeJson(res, 200, {
              ok: true,
              data: {
                items: rows.map((row) => ({
                  ...row,
                  hired_at: row.hired_at == null ? null : formatDateTimeCell(row.hired_at),
                  updated_at: formatDateTimeCell(row.updated_at)
                })),
                meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) }
              }
            });
            return;
          }

          if (url.pathname === '/api/integrations/hr-staff/requests') {
            await ensureHrStaffRequestTables(pool);
            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const search = toSafeText(url.searchParams.get('search')).toLowerCase();
              const requestStatus = toSafeText(url.searchParams.get('status')).toLowerCase();
              const excludeHiredRaw = toSafeText(url.searchParams.get('exclude_hired')).toLowerCase();
              const excludeHired = excludeHiredRaw === '1' || excludeHiredRaw === 'true' || excludeHiredRaw === 'yes';
              const urgentOnlyRaw = toSafeText(url.searchParams.get('urgent_only')).toLowerCase();
              const urgentOnly = urgentOnlyRaw === '1' || urgentOnlyRaw === 'true' || urgentOnlyRaw === 'yes';
              const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
              const perPage = Math.min(50, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 10)));
              const offset = (page - 1) * perPage;
              const where: string[] = [];
              const params: unknown[] = [];
              if (urgentOnly) {
                where.push('LOWER(r.request_status) IN (?, ?)');
                params.push('pending', 'queue');
              } else if (requestStatus) {
                where.push('LOWER(r.request_status) = ?');
                params.push(requestStatus);
              }
              if (excludeHired && !urgentOnly) {
                where.push('LOWER(r.request_status) <> ?');
                params.push('hired');
              }
              if (search) {
                const like = `%${search}%`;
                where.push('(LOWER(r.request_reference) LIKE ? OR LOWER(s.employee_no) LIKE ? OR LOWER(s.full_name) LIKE ?)');
                params.push(like, like, like);
              }
              const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
              const [countRows] = await pool.query<RowDataPacket>(
                `SELECT COUNT(*) AS total
                 FROM public.hr_staff_requests r
                 INNER JOIN public.hr_staff_directory s ON s.id = r.staff_id${whereSql}`,
                params
              );
              const total = Number(countRows[0]?.total || 0);
              const [rows] = await pool.query<RowDataPacket>(
                `SELECT
                   r.id, r.request_reference, r.staff_id, s.employee_no,
                   s.full_name AS staff_name, s.role_type, s.department_name,
                   r.request_status, r.request_notes, r.requested_by, r.decided_by,
                   r.decided_at, r.created_at, r.updated_at
                 FROM public.hr_staff_requests r
                 INNER JOIN public.hr_staff_directory s ON s.id = r.staff_id${whereSql}
                 ORDER BY r.created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, perPage, offset]
              );
              writeJson(res, 200, {
                ok: true,
                data: {
                  items: rows.map((row) => ({
                    ...row,
                    created_at: formatDateTimeCell(row.created_at),
                    updated_at: formatDateTimeCell(row.updated_at),
                    decided_at: row.decided_at == null ? null : formatDateTimeCell(row.decided_at)
                  })),
                  meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) }
                }
              });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const staffId = toSafeInt(body.staff_id, 0);
              const roleType = toSafeText(body.role_type).toLowerCase();
              const requestedCount = Math.max(1, toSafeInt(body.requested_count, 1));
              let staff: RowDataPacket | undefined;

              if (staffId) {
                const [staffRows] = await pool.query<RowDataPacket>(
                  `SELECT id, employee_no, full_name, role_type, department_name
                   FROM public.hr_staff_directory
                   WHERE id = ? AND LOWER(role_type) IN ('doctor', 'nurse')
                   LIMIT 1`,
                  [staffId]
                );
                staff = staffRows[0];
              } else if (roleType === 'doctor' || roleType === 'nurse') {
                const placeholderNo = roleType === 'doctor' ? 'HR-REQ-POOL-DOCTOR' : 'HR-REQ-POOL-NURSE';
                const placeholderName = roleType === 'doctor' ? 'Open Doctor Hiring Request' : 'Open Nurse Hiring Request';
                await pool.query(
                  `INSERT INTO public.hr_staff_directory (employee_no, full_name, role_type, department_name, employment_status, contact_email, contact_phone, hired_at)
                   VALUES (?, ?, ?, 'General Medicine', 'inactive', NULL, NULL, NULL)
                   ON CONFLICT (employee_no) DO NOTHING`,
                  [placeholderNo, placeholderName, roleType]
                );
                const [staffRows] = await pool.query<RowDataPacket>(
                  `SELECT id, employee_no, full_name, role_type, department_name
                   FROM public.hr_staff_directory
                   WHERE employee_no = ?
                   LIMIT 1`,
                  [placeholderNo]
                );
                staff = staffRows[0];
              }

              if (!staff) {
                writeJson(res, 422, { ok: false, message: 'Provide staff_id or role_type (doctor/nurse).' });
                return;
              }
              const requestReference = `HR-REQ-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 89999)}`;
              const mergedNotes = [toSafeText(body.request_notes), `Requested count: ${requestedCount}`]
                .filter((value) => value && value.trim() !== '')
                .join(' | ');
              await pool.query(
                `INSERT INTO public.hr_staff_requests (request_reference, staff_id, request_status, request_notes, requested_by)
                 VALUES (?, ?, 'pending', ?, ?)`,
                [requestReference, staff.id, mergedNotes || null, toSafeText(body.requested_by) || 'Clinic Admin']
              );
              await insertModuleActivity(
                pool,
                'hr_staff_request',
                'Doctor/Nurse Requested',
                `Requested ${requestedCount} ${toSafeText(staff.role_type)}(s) from HR.`,
                toSafeText(body.requested_by) || 'Clinic Admin',
                'hr_staff_request',
                requestReference
              );
              writeJson(res, 200, { ok: true, message: 'Doctor/Nurse request submitted to HR.' });
              return;
            }

            if ((req.method || '').toUpperCase() === 'PATCH') {
              const body = await readJsonBody(req);
              const requestId = toSafeInt(body.id, 0);
              const nextStatus = toSafeText(body.request_status).toLowerCase();
              const decidedBy = toSafeText(body.decided_by) || 'HR Admin';
              const allowedStatuses = new Set(['pending', 'approved', 'rejected', 'queue', 'waiting_applicant', 'hiring', 'hired']);
              if (!requestId || !allowedStatuses.has(nextStatus)) {
                writeJson(res, 422, { ok: false, message: 'id and valid request_status are required.' });
                return;
              }

              const [existingRows] = await pool.query<RowDataPacket>(
                `SELECT id, request_reference, request_status
                 FROM public.hr_staff_requests
                 WHERE id = ?
                 LIMIT 1`,
                [requestId]
              );
              const existing = existingRows[0];
              if (!existing) {
                writeJson(res, 404, { ok: false, message: 'Request not found.' });
                return;
              }

              await pool.query(
                `UPDATE public.hr_staff_requests
                 SET request_status = ?, decided_by = ?, decided_at = NOW()
                 WHERE id = ?`,
                [nextStatus, decidedBy, requestId]
              );

              await insertModuleActivity(
                pool,
                'hr_staff_request',
                'Request Status Updated',
                `Request ${toSafeText(existing.request_reference)} moved from ${toSafeText(existing.request_status)} to ${nextStatus}.`,
                decidedBy,
                'hr_staff_request',
                toSafeText(existing.request_reference)
              );

              writeJson(res, 200, { ok: true, message: 'Request status updated.' });
              return;
            }
          }

          if (url.pathname === '/api/integrations/prefect/incident-reports' && (req.method || 'GET').toUpperCase() === 'GET') {
            await ensureModuleActivityLogsTable(pool);
            const tokenConfigured = Boolean(toSafeText(options.departmentSharedToken));
            let storedPrefectIncidentCount = 0;
            try {
              const [countRows] = await pool.query<RowDataPacket>(
                `SELECT COUNT(*)::bigint AS total FROM module_activity_logs WHERE LOWER(module) = LOWER(?)`,
                ['prefect_incident']
              );
              storedPrefectIncidentCount = Number(countRows[0]?.total ?? 0);
            } catch {
              storedPrefectIncidentCount = 0;
            }
            writeJson(res, 200, {
              ok: true,
              data: {
                integrationModel: 'push',
                dataSource:
                  'This app never reads Prefect over HTTP. The inbox list is loaded only from the clinic database table module_activity_logs (module = prefect_incident).',
                explanation:
                  'The clinic UI does not call Prefect. Rows are stored in the database when the Prefect hub POSTs to this path (X-Integration-Token) or when a signed-in admin uses simulate_from_clinic_admin.',
                ingestUrl: '/api/integrations/prefect/incident-reports',
                httpMethod: 'POST',
                tokenConfigured,
                tokenMissingOnClinic: !tokenConfigured,
                storedPrefectIncidentCount,
                remotePrefectNote:
                  'If Prefect runs on Netlify or another remote host, CLINIC_PREFECT_BRIDGE_URL must be a public HTTPS URL to your clinic backend (not http://localhost:5173 unless Prefect runs on the same machine).',
                sharedEnvKey: 'DEPARTMENT_INTEGRATION_SHARED_TOKEN',
                clinicUiTestHint:
                  'Signed-in clinic admins can POST the same URL with JSON { simulate_from_clinic_admin: true, payload: { title, student_no, ... } } (no X-Integration-Token) to insert one test row, or use the "Record test row" button on the Prefect incident page.',
                registrySyncPath: '/api/integrations/prefect/sync-from-registry',
                registrySyncHint:
                  'When Prefect and Clinic share the same Supabase, department flows still write clinic.department_clearance_records even if the HTTP bridge to this dev server fails. POST sync-from-registry (admin cookie or X-Integration-Token) copies missing Prefect-sourced rows into module_activity_logs.'
              }
            });
            return;
          }

          if (url.pathname === '/api/integrations/prefect/sync-from-registry' && (req.method || '').toUpperCase() === 'POST') {
            await ensureModuleActivityLogsTable(pool);
            await ensureDepartmentClearanceTables(pool);
            const syncBody = (await readJsonBody(req)) as Record<string, unknown>;
            const tokenOkSync = hasValidDepartmentIntegrationToken(req, options);
            const adminSessionSync = await resolveAdminSession(pool, req);
            if (!tokenOkSync && !adminSessionSync) {
              writeJson(res, 401, {
                ok: false,
                message: 'Sign in to the clinic or send X-Integration-Token to sync from the shared registry.'
              });
              return;
            }
            const syncLimit = Math.min(100, Math.max(1, toSafeInt(syncBody.limit, 40)));
            const [clearanceRows] = await pool.query<RowDataPacket>(
              `SELECT id, clearance_reference, patient_name, patient_code, patient_type, remarks, metadata, created_at
               FROM clinic.department_clearance_records
               WHERE LOWER(department_key) = LOWER(?)
                 AND COALESCE(metadata->>'source_department', '') = ?
                 AND clearance_reference IS NOT NULL
                 AND TRIM(clearance_reference) <> ''
               ORDER BY created_at DESC
               LIMIT ?`,
              ['clinic', 'prefect', syncLimit]
            );
            let insertedSync = 0;
            let skippedSync = 0;
            for (const row of clearanceRows || []) {
              const ref = toSafeText(row.clearance_reference);
              if (!ref) {
                skippedSync += 1;
                continue;
              }
              const [existingLog] = await pool.query<RowDataPacket>(
                `SELECT id FROM public.module_activity_logs
                 WHERE LOWER(module) = LOWER(?) AND entity_key = ?
                 LIMIT 1`,
                ['prefect_incident', ref]
              );
              if (existingLog?.length) {
                skippedSync += 1;
                continue;
              }
              const meta = parseJsonRecord(row.metadata);
              const payload = meta.payload && typeof meta.payload === 'object' && !Array.isArray(meta.payload) ? meta.payload : {};
              const detailParts: string[] = [];
              const remarks = toSafeText(row.remarks);
              if (remarks) detailParts.push(remarks);
              const pname = toSafeText(row.patient_name);
              const pcode = toSafeText(row.patient_code);
              if (pname || pcode) {
                detailParts.push(`— ${[pname, pcode].filter(Boolean).join(' · ')}`);
              }
              detailParts.push(`Ref: ${ref}`);
              const detailSync = detailParts.filter(Boolean).join(' ') || `Prefect incident synced from registry (${ref}).`;
              await insertModuleActivity(
                pool,
                'prefect_incident',
                'Prefect incident (synced from shared registry)',
                detailSync,
                'Prefect Management',
                'prefect_incident',
                ref,
                {
                  source: 'prefect_registry_sync',
                  clearance_record_id: row.id,
                  registry_synced_at: new Date().toISOString(),
                  payload,
                  registry_metadata: meta
                }
              );
              insertedSync += 1;
            }
            writeJson(res, 200, {
              ok: true,
              message: `Registry sync: ${insertedSync} new activity row(s), ${skippedSync} skipped (duplicate or empty ref).`,
              data: {
                inserted: insertedSync,
                skipped: skippedSync,
                scanned: (clearanceRows || []).length
              }
            });
            return;
          }

          if (url.pathname === '/api/integrations/prefect/incident-reports' && (req.method || '').toUpperCase() === 'POST') {
            await ensureModuleActivityLogsTable(pool);
            const body = (await readJsonBody(req)) as Record<string, unknown>;
            const tokenOk = hasValidDepartmentIntegrationToken(req, options);
            const adminSession = await resolveAdminSession(pool, req);
            const adminSimulate = toBooleanFlag(body.simulate_from_clinic_admin) && Boolean(adminSession);
            if (!tokenOk && !adminSimulate) {
              writeJson(res, 401, {
                ok: false,
                message:
                  'Send header X-Integration-Token (same value as DEPARTMENT_INTEGRATION_SHARED_TOKEN), or sign in to the clinic and POST JSON with simulate_from_clinic_admin: true plus a payload object to record a test row.'
              });
              return;
            }
            const payloadRaw = body.payload;
            const payload =
              payloadRaw && typeof payloadRaw === 'object' && !Array.isArray(payloadRaw)
                ? (payloadRaw as Record<string, unknown>)
                : {};
            const correlationId = toSafeText(body.correlation_id);
            const firstText = (...vals: unknown[]) => {
              for (const v of vals) {
                const t = toSafeText(v);
                if (t) return t;
              }
              return '';
            };
            const studentNo = firstText(
              payload.student_no,
              payload.studentNo,
              payload.patient_code,
              body.patient_code,
              payload.student_id
            );
            const studentName = firstText(
              payload.student_name,
              payload.studentName,
              payload.patient_name,
              payload.name,
              body.patient_name
            );
            const referenceNo = firstText(
              payload.reference_no,
              payload.referenceNo,
              payload.case_reference,
              body.clearance_reference,
              payload.clearance_reference
            );
            const title = firstText(
              payload.title,
              payload.incident_type,
              payload.type,
              payload.subject,
              'Prefect health-related incident'
            );
            const notes = firstText(
              payload.notes,
              payload.remarks,
              payload.incident_summary,
              payload.description,
              payload.concern,
              payload.action_taken,
              payload.record_remarks
            );
            const statusText = firstText(payload.status, payload.state);
            const severityText = firstText(payload.severity, payload.priority, payload.risk_level);
            const locationText = firstText(payload.location, payload.campus_location, payload.venue);
            const incidentDateText = firstText(payload.incident_date, payload.date_occurred, payload.occurred_at);
            const reportedByText = firstText(
              payload.reported_by,
              payload.requested_by,
              payload.requestedBy,
              payload.reportedBy
            );
            const incidentTypeText = firstText(payload.incident_type, payload.type, payload.category);
            const detailParts: string[] = [title];
            if (studentName || studentNo) {
              detailParts.push(`— ${[studentName, studentNo].filter(Boolean).join(' · ')}`);
            }
            if (referenceNo) detailParts.push(`Ref: ${referenceNo}`);
            if (severityText) detailParts.push(`Severity: ${severityText}`);
            if (locationText) detailParts.push(`Location: ${locationText}`);
            if (notes) detailParts.push(notes);
            if (statusText) detailParts.push(`Status: ${statusText}`);
            const detail = detailParts.filter(Boolean).join(' ') || 'Prefect forwarded an incident to Clinic.';
            const entityKey =
              correlationId ||
              referenceNo ||
              toSafeText(body.event_id) ||
              `prefect-${Date.now()}`;
            const actionLabel = adminSimulate ? 'Prefect incident (clinic admin test)' : 'Prefect incident report received';
            const actorLabel = adminSimulate
              ? toSafeText(adminSession?.full_name) || toSafeText(adminSession?.username) || 'Clinic Admin'
              : 'Prefect Management';
            const incident = {
              title,
              student_no: studentNo,
              student_name: studentName,
              reference_no: referenceNo,
              incident_type: incidentTypeText,
              severity: severityText,
              location: locationText,
              incident_date: incidentDateText,
              status: statusText,
              notes,
              description: firstText(payload.description, payload.incident_summary),
              remarks: firstText(payload.remarks),
              action_taken: firstText(payload.action_taken),
              reported_by: reportedByText,
              patient_code: firstText(body.patient_code, payload.patient_code),
              patient_name: firstText(body.patient_name, payload.patient_name),
              clearance_reference: firstText(body.clearance_reference, payload.clearance_reference)
            };
            await insertModuleActivity(
              pool,
              'prefect_incident',
              actionLabel,
              detail,
              actorLabel,
              'prefect_incident',
              entityKey,
              {
                source: adminSimulate ? 'clinic_admin_simulate' : 'prefect',
                admin_simulated: adminSimulate,
                correlation_id: correlationId,
                event_id: body.event_id,
                event_code: body.event_code,
                clearance_reference: body.clearance_reference,
                patient_name: body.patient_name,
                patient_code: body.patient_code,
                patient_type: body.patient_type,
                incident,
                payload,
                record_metadata: body.record_metadata,
                bridge_received_at: new Date().toISOString()
              }
            );
            writeJson(res, 200, { ok: true, message: 'Incident recorded in Clinic.', entity_key: entityKey });
            return;
          }

          if (url.pathname === '/api/integrations/departments/map' && (req.method || 'GET').toUpperCase() === 'GET') {
            writeJson(res, 200, {
              ok: true,
              data: {
                departments: departmentIntegrationMap()
              }
            });
            return;
          }

          if (url.pathname === '/api/integrations/departments/report') {
            await ensureDepartmentClearanceTables(pool);
            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const departmentKey = toSafeText(url.searchParams.get('department')).toLowerCase();
              if (!departmentKey) {
                writeJson(res, 422, { ok: false, message: 'department is required.' });
                return;
              }
              const report = await buildDepartmentReport(pool, departmentKey);
              writeJson(res, 200, { ok: true, data: report });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const action = toSafeText(body.action).toLowerCase();
              const departmentKey = toSafeText(body.department_key).toLowerCase();
              const targetKey = toSafeText(body.target_key).toLowerCase();
              const reportType = toSafeText(body.report_type).toLowerCase();
              const departmentDef = departmentIntegrationMap().find((item) => item.key === departmentKey);
              const adminSession = await resolveAdminSession(pool, req);
              const tokenAuthenticated = hasValidDepartmentIntegrationToken(req, options);
              if (!adminSession && !tokenAuthenticated) {
                writeJson(res, 401, { ok: false, message: 'Admin authentication or X-Integration-Token is required to dispatch department reports.' });
                return;
              }
              if (action !== 'dispatch_report' || !departmentDef || !targetKey || !reportType) {
                writeJson(res, 422, { ok: false, message: 'action=dispatch_report, department_key, target_key, and report_type are required.' });
                return;
              }

              const report = await buildDepartmentReport(pool, departmentKey);
              const reportKey = `${departmentKey}:${targetKey}:${new Date().toISOString()}`;
              const detail = `${departmentDef.name} sent ${reportType.replace(/_/g, ' ')} to ${targetKey}.`;
              await insertModuleActivity(
                pool,
                'department_reports',
                'Report Dispatched',
                detail,
                resolveDepartmentActor(body.actor, departmentDef.name, adminSession, tokenAuthenticated),
                'department_report',
                reportKey,
                {
                  department_key: departmentKey,
                  target_key: targetKey,
                  report_type: reportType,
                  report_name: toSafeText(body.report_name) || reportType,
                  summary: parseJsonRecord(body.summary),
                  report
                }
              );
              writeJson(res, 200, {
                ok: true,
                message: 'Department report dispatched.',
                data: {
                  department_key: departmentKey,
                  target_key: targetKey,
                  report_type: reportType,
                  entity_key: reportKey
                }
              });
              return;
            }
          }

          if (url.pathname === '/api/integrations/departments/records') {
            await ensureDepartmentClearanceTables(pool);

            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const department = toSafeText(url.searchParams.get('department')).toLowerCase();
              const status = toSafeText(url.searchParams.get('status')).toLowerCase();
              const search = toSafeText(url.searchParams.get('search')).toLowerCase();
              const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
              const perPage = Math.min(50, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 15)));
              const offset = (page - 1) * perPage;
              const where: string[] = [];
              const params: unknown[] = [];
              if (department) {
                where.push('LOWER(department_key) = ?');
                params.push(department);
              }
              if (status) {
                where.push('LOWER(status) = ?');
                params.push(status);
              }
              if (search) {
                const like = `%${search}%`;
                where.push('(LOWER(patient_name) LIKE ? OR LOWER(COALESCE(patient_code, \'\')) LIKE ? OR LOWER(COALESCE(clearance_reference, \'\')) LIKE ? OR LOWER(COALESCE(external_reference, \'\')) LIKE ?)');
                params.push(like, like, like, like);
              }
              const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
              const [countRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM department_clearance_records${whereSql}`, params);
              const total = Number(countRows[0]?.total || 0);
              const [rows] = await pool.query<RowDataPacket>(
                `SELECT *
                 FROM department_clearance_records${whereSql}
                 ORDER BY stage_order ASC, created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, perPage, offset]
              );
              writeJson(res, 200, {
                ok: true,
                data: {
                  items: rows.map((row) => ({
                    ...row,
                    patient_type:
                      toSafeText(row.patient_type) !== ''
                        ? normalizePatientType(row.patient_type)
                        : inferPatientType({
                            patientType: row.patient_type,
                            patientName: row.patient_name,
                            patientId: row.patient_id || row.patient_code || row.external_reference
                          }),
                    metadata: parseJsonRecord(row.metadata),
                    created_at: formatDateTimeCell(row.created_at),
                    updated_at: formatDateTimeCell(row.updated_at),
                    decided_at: row.decided_at == null ? null : formatDateTimeCell(row.decided_at)
                  })),
                  meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
                  departments: departmentIntegrationMap()
                }
              });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const action = toSafeText(body.action).toLowerCase();
              const departmentKey = toSafeText(body.department_key).toLowerCase();
              const departmentDef = departmentIntegrationMap().find((item) => item.key === departmentKey);
              const adminSession = await resolveAdminSession(pool, req);
              const tokenAuthenticated = hasValidDepartmentIntegrationToken(req, options);
              if (!departmentDef && action !== 'seed_defaults') {
                writeJson(res, 422, { ok: false, message: 'Valid department_key is required.' });
                return;
              }

              if (action === 'request_clearance') {
                if (!adminSession && !tokenAuthenticated) {
                  writeJson(res, 401, { ok: false, message: 'Admin authentication or X-Integration-Token is required to create department clearance records.' });
                  return;
                }
                const patientName = toSafeText(body.patient_name);
                if (!patientName) {
                  writeJson(res, 422, { ok: false, message: 'patient_name is required.' });
                  return;
                }
                const clearanceReference = toSafeText(body.clearance_reference) || `CLR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 899999)}`;
                const requesterName = resolveDepartmentActor(body.requested_by, departmentDef?.name || 'Department', adminSession, tokenAuthenticated);
                await pool.query(
                  `INSERT INTO department_clearance_records (
                    clearance_reference, patient_id, patient_code, patient_name, patient_type,
                    department_key, department_name, stage_order, status, remarks, approver_name,
                    approver_role, external_reference, requested_by, metadata
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT (clearance_reference) DO UPDATE SET
                    patient_id = EXCLUDED.patient_id,
                    patient_code = EXCLUDED.patient_code,
                    patient_name = EXCLUDED.patient_name,
                    patient_type = EXCLUDED.patient_type,
                    department_key = EXCLUDED.department_key,
                    department_name = EXCLUDED.department_name,
                    stage_order = EXCLUDED.stage_order,
                    remarks = EXCLUDED.remarks,
                    approver_name = EXCLUDED.approver_name,
                    approver_role = EXCLUDED.approver_role,
                    external_reference = EXCLUDED.external_reference,
                    requested_by = EXCLUDED.requested_by,
                    metadata = EXCLUDED.metadata,
                    updated_at = CURRENT_TIMESTAMP`,
                  [
                    clearanceReference,
                    toSafeText(body.patient_id) || null,
                    toSafeText(body.patient_code) || null,
                    patientName,
                    normalizePatientType(body.patient_type),
                    departmentDef?.key,
                    departmentDef?.name,
                    Number(departmentDef?.stageOrder || 0),
                    toSafeText(body.status) || 'pending',
                    toSafeText(body.remarks) || null,
                    toSafeText(body.approver_name) || null,
                    toSafeText(body.approver_role) || null,
                    toSafeText(body.external_reference) || null,
                    requesterName,
                    JSON.stringify(parseJsonRecord(body.metadata))
                  ]
                );
                await insertModuleActivity(pool, 'department_clearance', 'Clearance Requested', `Clearance requested from ${departmentDef?.name} for ${patientName}.`, requesterName, 'clearance', clearanceReference, { department: departmentDef?.key, auth_mode: tokenAuthenticated && !adminSession ? 'shared_token' : 'admin_session' });
                writeJson(res, 200, { ok: true, message: 'Department clearance request saved.', data: { clearance_reference: clearanceReference } });
                return;
              }

              if (action === 'submit_decision') {
                if (departmentKey === 'cashier') {
                  if (!adminSession) {
                    writeJson(res, 401, { ok: false, message: 'Admin authentication required.' });
                    return;
                  }
                  if (!canManageCashierFinancials(adminSession)) {
                    writeJson(res, 403, { ok: false, message: 'Only cashier or finance-authorized admins can submit cashier clearance decisions.' });
                    return;
                  }
                } else if (!adminSession && !tokenAuthenticated) {
                  writeJson(res, 401, { ok: false, message: 'Admin authentication or X-Integration-Token is required to submit department decisions.' });
                  return;
                }
                const clearanceReference = toSafeText(body.clearance_reference);
                const nextStatus = toSafeText(body.status).toLowerCase();
                if (!clearanceReference || !['approved', 'rejected', 'hold', 'pending'].includes(nextStatus)) {
                  writeJson(res, 422, { ok: false, message: 'clearance_reference and valid status are required.' });
                  return;
                }
                const approverName = resolveDepartmentActor(body.approver_name, departmentDef?.name || 'Department', adminSession, tokenAuthenticated);
                const mergedMetadata = {
                  ...parseJsonRecord(body.metadata),
                  auth_mode: tokenAuthenticated && !adminSession ? 'shared_token' : 'admin_session'
                };
                await pool.query(
                  `UPDATE department_clearance_records
                   SET status = ?, remarks = ?, approver_name = ?, approver_role = ?, external_reference = COALESCE(?, external_reference),
                       decided_at = CURRENT_TIMESTAMP, metadata = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE clearance_reference = ?`,
                  [
                    nextStatus,
                    toSafeText(body.remarks) || null,
                    approverName,
                    toSafeText(body.approver_role) || (tokenAuthenticated && !adminSession ? `${departmentDef?.name || 'Department'} API` : null),
                    toSafeText(body.external_reference) || null,
                    JSON.stringify(mergedMetadata),
                    clearanceReference
                  ]
                );
                await insertModuleActivity(pool, 'department_clearance', `Clearance ${nextStatus}`, `${departmentDef?.name} marked ${clearanceReference} as ${nextStatus}.`, approverName, 'clearance', clearanceReference, { department: departmentDef?.key, status: nextStatus, auth_mode: tokenAuthenticated && !adminSession ? 'shared_token' : 'admin_session' });
                writeJson(res, 200, { ok: true, message: 'Department decision recorded.' });
                return;
              }

              if (action === 'seed_defaults') {
                if (!adminSession) {
                  writeJson(res, 401, { ok: false, message: 'Admin authentication required to seed default department records.' });
                  return;
                }
                const patientName = toSafeText(body.patient_name) || 'Integration Test Patient';
                const patientCode = toSafeText(body.patient_code) || 'PAT-INTEGRATION-001';
                const patientType = normalizePatientType(body.patient_type);
                for (const department of departmentIntegrationMap()) {
                  const clearanceReference = `${department.key.toUpperCase()}-${patientCode}`;
                  await pool.query(
                    `INSERT INTO department_clearance_records (
                      clearance_reference, patient_id, patient_code, patient_name, patient_type,
                      department_key, department_name, stage_order, status, requested_by, metadata
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
                    ON CONFLICT (clearance_reference) DO UPDATE SET
                      patient_name = EXCLUDED.patient_name,
                      patient_type = EXCLUDED.patient_type,
                      requested_by = EXCLUDED.requested_by,
                      metadata = EXCLUDED.metadata,
                      updated_at = CURRENT_TIMESTAMP`,
                    [
                      clearanceReference,
                      toSafeText(body.patient_id) || null,
                      patientCode,
                      patientName,
                      patientType,
                      department.key,
                      department.name,
                      department.stageOrder,
                      toSafeText(body.requested_by) || 'System',
                      JSON.stringify({ purpose: department.purpose })
                    ]
                  );
                }
                writeJson(res, 200, { ok: true, message: 'Default department clearance records created.' });
                return;
              }

              writeJson(res, 422, { ok: false, message: 'Unsupported department clearance action.' });
              return;
            }
          }

          if (url.pathname === '/api/module-activity' && (req.method || 'GET').toUpperCase() === 'GET') {
            await ensureModuleActivityLogsTable(pool);
            await ensureLaboratoryTables(pool);

            const moduleFilter = toSafeText(url.searchParams.get('module')).toLowerCase();
            const actorFilter = toSafeText(url.searchParams.get('actor')).toLowerCase();
            const search = toSafeText(url.searchParams.get('search')).toLowerCase();
            const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
            const perPage = Math.min(100, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 12)));
            const offset = (page - 1) * perPage;
            const where: string[] = [];
            const params: unknown[] = [];

            if (moduleFilter && moduleFilter !== 'all') {
              where.push('LOWER(module) = ?');
              params.push(moduleFilter);
            }
            if (actorFilter) {
              where.push('LOWER(actor) LIKE ?');
              params.push(`%${actorFilter}%`);
            }
            if (search) {
              where.push('(LOWER(action) LIKE ? OR LOWER(detail) LIKE ? OR LOWER(COALESCE(entity_key, \'\')) LIKE ?)');
              params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }

            const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
            const [countRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM module_activity_logs${whereSql}`, params);
            let total = Number(countRows[0]?.total || 0);
            let [rows] = await pool.query<RowDataPacket>(
              `SELECT id, module, action, detail, actor, entity_type, entity_key, metadata, created_at
               FROM module_activity_logs${whereSql}
               ORDER BY created_at DESC
               LIMIT ? OFFSET ?`,
              [...params, perPage, offset]
            );

            if ((!rows || rows.length === 0) && moduleFilter === 'laboratory') {
              const labWhere: string[] = [];
              const labParams: unknown[] = [];
              if (actorFilter) {
                labWhere.push('LOWER(actor) LIKE ?');
                labParams.push(`%${actorFilter}%`);
              }
              if (search) {
                labWhere.push('(LOWER(action) LIKE ? OR LOWER(details) LIKE ? OR CAST(request_id AS CHAR) LIKE ?)');
                labParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
              }
              const labWhereSql = labWhere.length ? ` WHERE ${labWhere.join(' AND ')}` : '';
              const [labCountRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM laboratory_activity_logs${labWhereSql}`, labParams);
              total = Number(labCountRows[0]?.total || 0);
              const [labRows] = await pool.query<RowDataPacket>(
                `SELECT
                   id,
                   'laboratory' AS module,
                   action,
                   details AS detail,
                   actor,
                   'lab_request' AS entity_type,
                   CAST(request_id AS CHAR) AS entity_key,
                   JSON_OBJECT() AS metadata,
                   created_at
                 FROM laboratory_activity_logs${labWhereSql}
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`,
                [...labParams, perPage, offset]
              );
              rows = labRows;
            }

            writeJson(res, 200, {
              ok: true,
              data: {
                items: (rows || []).map((row) => ({
                  ...row,
                  metadata: parseJsonRecord(row.metadata),
                  created_at: formatDateTimeCell(row.created_at)
                })),
                meta: {
                  page,
                  perPage,
                  total,
                  totalPages: Math.max(1, Math.ceil(total / perPage))
                }
              }
            });
            return;
          }

          if (url.pathname === '/api/reports' && (req.method || 'GET').toUpperCase() === 'GET') {
            await ensureModuleActivityLogsTable(pool);
            await ensurePatientAppointmentsTable(pool);
            await ensurePatientWalkinsTable(pool);
            await ensureCheckupVisitsTable(pool);
            await ensureMentalHealthTables(pool);
            await ensurePharmacyInventoryTables(pool);
            await ensurePatientMasterTables(pool);
            await ensureDepartmentClearanceTables(pool);
            await ensureCashierIntegrationTables(pool);

            const requestedFrom = toSqlDate(url.searchParams.get('from')) || '';
            const requestedTo = toSqlDate(url.searchParams.get('to')) || '';
            const today = new Date();
            const defaultTo = today.toISOString().slice(0, 10);
            const defaultFromDate = new Date(today);
            defaultFromDate.setDate(defaultFromDate.getDate() - 29);
            const fromDate = requestedFrom || defaultFromDate.toISOString().slice(0, 10);
            const toDate = requestedTo || defaultTo;
            const trendDays = buildDateSeries(fromDate, toDate);
            const trendMap = new Map(trendDays.map((day) => [day, { day, appointments: 0, walkin: 0, checkup: 0, mental: 0, pharmacy: 0 }]));

            const [patientTotalsRows] = await pool.query<RowDataPacket>(
              `SELECT COUNT(*) AS total_patients, SUM(CASE WHEN LOWER(COALESCE(risk_level, '')) = 'high' THEN 1 ELSE 0 END) AS high_risk, SUM(CASE WHEN appointment_count > 0 OR walkin_count > 0 OR checkup_count > 0 OR mental_count > 0 OR pharmacy_count > 0 THEN 1 ELSE 0 END) AS active_profiles FROM patient_master`
            );

            const [appointmentsRows] = await pool.query<RowDataPacket>(
              `SELECT COUNT(*) AS total, SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('pending', 'new') THEN 1 ELSE 0 END) AS pending
               FROM patient_appointments
               WHERE appointment_date BETWEEN ? AND ?`,
              [fromDate, toDate]
            );
            const [walkinRows] = await pool.query<RowDataPacket>(
              `SELECT COUNT(*) AS total,
                      SUM(CASE WHEN LOWER(COALESCE(status, '')) = 'emergency' OR LOWER(COALESCE(severity, '')) = 'emergency' THEN 1 ELSE 0 END) AS emergency
               FROM patient_walkins
               WHERE COALESCE(checkin_time, intake_time, created_at)::date BETWEEN ? AND ?`,
              [fromDate, toDate]
            );
            const [checkupRows] = await pool.query<RowDataPacket>(
              `SELECT COUNT(*) AS total,
                      SUM(CASE WHEN LOWER(COALESCE(status, '')) = 'in_consultation' THEN 1 ELSE 0 END) AS in_consultation
               FROM checkup_visits
               WHERE created_at::date BETWEEN ? AND ?`,
              [fromDate, toDate]
            );
            const [mentalRows] = await pool.query<RowDataPacket>(
              `SELECT COUNT(*) AS total,
                      SUM(CASE WHEN LOWER(COALESCE(risk_level, '')) = 'high' OR LOWER(COALESCE(status, '')) IN ('at_risk', 'escalated') THEN 1 ELSE 0 END) AS at_risk
               FROM mental_health_sessions
               WHERE created_at::date BETWEEN ? AND ?`,
              [fromDate, toDate]
            );
            const [pharmacyRows] = await pool.query<RowDataPacket>(
              `SELECT COUNT(*) AS total
               FROM pharmacy_dispense_requests
               WHERE requested_at::date BETWEEN ? AND ?`,
              [fromDate, toDate]
            );

            const trendQueries: Array<[string, string, 'appointments' | 'walkin' | 'checkup' | 'mental' | 'pharmacy']> = [
              [`SELECT to_char(appointment_date, 'YYYY-MM-DD') AS day, COUNT(*) AS total FROM patient_appointments WHERE appointment_date BETWEEN ? AND ? GROUP BY to_char(appointment_date, 'YYYY-MM-DD')`, 'appointments', 'appointments'],
              [`SELECT to_char(COALESCE(checkin_time, intake_time, created_at)::date, 'YYYY-MM-DD') AS day, COUNT(*) AS total FROM patient_walkins WHERE COALESCE(checkin_time, intake_time, created_at)::date BETWEEN ? AND ? GROUP BY to_char(COALESCE(checkin_time, intake_time, created_at)::date, 'YYYY-MM-DD')`, 'walkin', 'walkin'],
              [`SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*) AS total FROM checkup_visits WHERE created_at::date BETWEEN ? AND ? GROUP BY to_char(created_at::date, 'YYYY-MM-DD')`, 'checkup', 'checkup'],
              [`SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*) AS total FROM mental_health_sessions WHERE created_at::date BETWEEN ? AND ? GROUP BY to_char(created_at::date, 'YYYY-MM-DD')`, 'mental', 'mental'],
              [`SELECT to_char(requested_at::date, 'YYYY-MM-DD') AS day, COUNT(*) AS total FROM pharmacy_dispense_requests WHERE requested_at::date BETWEEN ? AND ? GROUP BY to_char(requested_at::date, 'YYYY-MM-DD')`, 'pharmacy', 'pharmacy']
            ];

            for (const [query, , metricKey] of trendQueries) {
              const [trendRows] = await pool.query<RowDataPacket>(query, [fromDate, toDate]);
              for (const row of trendRows) {
                const bucket = trendMap.get(String(row.day || ''));
                if (bucket) bucket[metricKey] = Number(row.total || 0);
              }
            }

            const [activityRows] = await pool.query<RowDataPacket>(
              `SELECT module, action, detail, actor, created_at
               FROM module_activity_logs
               ORDER BY created_at DESC
               LIMIT 20`
            );
            const pmedPackage = await buildPmedRequiredReportsPackage(pool);
            const pmedRequestNotifications = await buildClinicPmedRequestNotifications(pool);

            writeJson(res, 200, {
              ok: true,
              data: {
                generatedAt: new Date().toISOString(),
                window: { from: fromDate, to: toDate },
                kpis: {
                  totalPatients: Number(patientTotalsRows[0]?.total_patients || 0),
                  activeProfiles: Number(patientTotalsRows[0]?.active_profiles || 0),
                  highRiskPatients: Number(patientTotalsRows[0]?.high_risk || 0),
                  totalVisits: Number(appointmentsRows[0]?.total || 0) + Number(walkinRows[0]?.total || 0) + Number(checkupRows[0]?.total || 0) + Number(mentalRows[0]?.total || 0),
                  pendingQueue: Number(appointmentsRows[0]?.pending || 0) + Number(checkupRows[0]?.in_consultation || 0),
                  emergencyCases: Number(walkinRows[0]?.emergency || 0) + Number(mentalRows[0]?.at_risk || 0),
                  dispensedItems: Number(pharmacyRows[0]?.total || 0)
                },
                moduleTotals: [
                  { module: 'Appointments', total: Number(appointmentsRows[0]?.total || 0) },
                  { module: 'Walk-In', total: Number(walkinRows[0]?.total || 0) },
                  { module: 'Check-Up', total: Number(checkupRows[0]?.total || 0) },
                  { module: 'Mental Health', total: Number(mentalRows[0]?.total || 0) },
                  { module: 'Pharmacy', total: Number(pharmacyRows[0]?.total || 0) }
                ],
                dailyTrend: Array.from(trendMap.values()),
                recentActivity: activityRows.map((row) => ({
                  module: String(row.module || ''),
                  action: String(row.action || ''),
                  detail: String(row.detail || ''),
                  actor: String(row.actor || ''),
                  created_at: formatDateTimeCell(row.created_at)
                })),
                pmedPackage,
                pmedRequestNotifications
              }
            });
            return;
          }

          if (url.pathname === '/api/reports' && (req.method || '').toUpperCase() === 'POST') {
            await ensureModuleActivityLogsTable(pool);
            await ensureDepartmentClearanceTables(pool);
            await ensureCashierIntegrationTables(pool);
            const body = await readJsonBody(req);
            const action = toSafeText(body.action).toLowerCase();

            if (action !== 'send_to_pmed') {
              writeJson(res, 422, { ok: false, message: 'Unsupported reports action.' });
              return;
            }

            const pmedPackage = await buildPmedRequiredReportsPackage(pool);
            const dispatchedAt = new Date().toISOString();
            const reportKey = `reports:pmed:${dispatchedAt}`;
            const detail = `Clinic reports sent ${Number((pmedPackage.summary as Record<string, unknown>)?.section_count || 0)} PMED-required sections.`;
            const actor = toSafeText(body.actor) || 'Reports Admin';
            await insertModuleActivity(
              pool,
              'department_reports',
              'Report Sent to PMED',
              detail,
              actor,
              'department_report',
              reportKey,
              {
                department_key: 'reports',
                source_department: 'clinic',
                source_department_name: 'Clinic',
                target_key: 'pmed',
                target_department: 'pmed',
                stage: 'reporting',
                report_type: 'pmed_required_reports',
                report_name: 'Clinic PMED Required Reports',
                export_format: 'JSON',
                delivery_status: 'Received',
                dispatched_at: dispatchedAt,
                summary: pmedPackage.summary,
                pmed_sections: pmedPackage.sections
              }
            );
            await insertModuleActivity(
              pool,
              'reports',
              'PMED Report Package Sent',
              detail,
              actor,
              'report_dispatch',
              reportKey,
              {
                target_key: 'pmed',
                report_type: 'pmed_required_reports',
                dispatched_at: dispatchedAt
              }
            );
            await insertModuleActivity(
              pool,
              'pmed',
              'DEPARTMENT_REPORT_RECEIVED',
              'Clinic PMED required report package arrived in the PMED reporting inbox.',
              actor,
              'report',
              reportKey,
              {
                source_department: 'clinic',
                source_department_name: 'Clinic',
                target_department: 'pmed',
                report_type: 'pmed_required_reports',
                report_name: 'Clinic PMED Required Reports',
                export_format: 'JSON',
                delivery_status: 'Received',
                dispatched_at: dispatchedAt,
                summary: pmedPackage.summary,
                pmed_sections: pmedPackage.sections
              }
            );

            writeJson(res, 200, {
              ok: true,
              message: 'Required reports sent to PMED.',
              data: {
                reportKey,
                package: await buildPmedRequiredReportsPackage(pool)
              }
            });
            return;
          }

          if (url.pathname === '/api/dashboard' && (req.method || 'GET').toUpperCase() === 'GET') {
            await ensurePatientAppointmentsTable(pool);
            await ensurePatientMasterTables(pool);

            const [summaryRows] = await pool.query<RowDataPacket>(
              `SELECT
                 (SELECT COUNT(*) FROM patient_master) AS total_patients,
                 (SELECT COUNT(*) FROM patient_appointments) AS total_appointments,
                 (SELECT COUNT(*) FROM patient_appointments WHERE appointment_date = CURRENT_DATE) AS today_appointments,
                 (SELECT COUNT(*) FROM patient_appointments WHERE LOWER(COALESCE(status, '')) IN ('pending', 'new', 'awaiting')) AS pending_appointments,
                 (SELECT COUNT(*) FROM patient_appointments WHERE LOWER(COALESCE(status, '')) = 'completed' AND updated_at::date = CURRENT_DATE) AS completed_today,
                 (SELECT COUNT(*) FROM patient_master WHERE created_at >= date_trunc('month', CURRENT_DATE)::date) AS new_patients_month`
            );
            const summary = summaryRows[0] || {};

            const monthSeries = buildRecentMonthSeries(6);
            const monthCounts = new Map(monthSeries.map((item) => [item.key, 0]));
            const [trendRows] = await pool.query<RowDataPacket>(
              `SELECT TRIM(to_char(appointment_date, 'Mon')) AS label, LOWER(TRIM(to_char(appointment_date, 'Mon'))) AS month_key, COUNT(*) AS total
               FROM patient_appointments
               WHERE appointment_date >= ? AND appointment_date < ?
               GROUP BY to_char(appointment_date, 'YYYY-MM'), TRIM(to_char(appointment_date, 'Mon'))
               ORDER BY MIN(appointment_date)`,
              [monthSeries[0]?.start || currentDateString(), monthSeries[monthSeries.length - 1]?.end || currentDateString()]
            );
            trendRows.forEach((row) => {
              monthCounts.set(String(row.month_key || ''), Number(row.total || 0));
            });

            const [statusRows] = await pool.query<RowDataPacket>(
              `SELECT COALESCE(NULLIF(TRIM(status), ''), 'Pending') AS label, COUNT(*) AS total
               FROM patient_appointments
               GROUP BY COALESCE(NULLIF(TRIM(status), ''), 'Pending')
               ORDER BY total DESC`
            );
            const [deptRows] = await pool.query<RowDataPacket>(
              `SELECT COALESCE(NULLIF(TRIM(department_name), ''), 'General') AS label, COUNT(*) AS total
               FROM patient_appointments
               GROUP BY COALESCE(NULLIF(TRIM(department_name), ''), 'General')
               ORDER BY total DESC
               LIMIT 6`
            );
            const [upcomingRows] = await pool.query<RowDataPacket>(
              `SELECT booking_id, patient_name, doctor_name, department_name, appointment_date, preferred_time, status
               FROM patient_appointments
               WHERE appointment_date >= CURRENT_DATE
               ORDER BY appointment_date ASC, COALESCE(preferred_time, '99:99') ASC
               LIMIT 8`
            );
            const [recentRows] = await pool.query<RowDataPacket>(
              `SELECT patient_code, patient_name, COALESCE(sex, '') AS sex, created_at
               FROM patient_master
               ORDER BY created_at DESC
               LIMIT 8`
            );

            writeJson(res, 200, {
              ok: true,
              data: {
                generatedAt: new Date().toISOString(),
                summary: {
                  totalPatients: Number(summary.total_patients || 0),
                  totalAppointments: Number(summary.total_appointments || 0),
                  todayAppointments: Number(summary.today_appointments || 0),
                  pendingAppointments: Number(summary.pending_appointments || 0),
                  completedToday: Number(summary.completed_today || 0),
                  newPatientsThisMonth: Number(summary.new_patients_month || 0)
                },
                appointmentsTrend: monthSeries.map((item) => ({
                  key: item.key,
                  label: item.label,
                  total: Number(monthCounts.get(item.key) || 0)
                })),
                statusBreakdown: statusRows.map((row) => ({ label: String(row.label || ''), total: Number(row.total || 0) })),
                departmentBreakdown: deptRows.map((row) => ({ label: String(row.label || ''), total: Number(row.total || 0) })),
                upcomingAppointments: upcomingRows.map((row) => ({
                  bookingId: String(row.booking_id || ''),
                  patientName: String(row.patient_name || ''),
                  doctorName: String(row.doctor_name || ''),
                  department: String(row.department_name || ''),
                  appointmentDate: formatDateCell(row.appointment_date),
                  preferredTime: String(row.preferred_time || ''),
                  status: String(row.status || '')
                })),
                recentPatients: recentRows.map((row) => ({
                  patientId: String(row.patient_code || ''),
                  patientName: String(row.patient_name || ''),
                  patientGender: String(row.sex || ''),
                  createdAt: formatDateTimeCell(row.created_at)
                }))
              }
            });
            return;
          }

          if (url.pathname === '/api/registrations') {
            await ensurePatientRegistrationsTable(pool);

            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const search = toSafeText(url.searchParams.get('search'));
              const status = toSafeText(url.searchParams.get('status'));
              const sort = toSafeText(url.searchParams.get('sort') || 'Sort Latest Intake');
              const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
              const perPage = Math.min(50, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 10)));
              const offset = (page - 1) * perPage;
              const where: string[] = [];
              const params: unknown[] = [];

              if (search) {
                const searchLike = `%${search.toLowerCase()}%`;
                where.push('(LOWER(patient_name) LIKE ? OR LOWER(COALESCE(patient_email, \'\')) LIKE ? OR LOWER(COALESCE(concern, \'\')) LIKE ? OR LOWER(COALESCE(assigned_to, \'\')) LIKE ? OR LOWER(case_id) LIKE ?)');
                params.push(searchLike, searchLike, searchLike, searchLike, searchLike);
              }
              if (status && status.toLowerCase() !== 'all statuses') {
                where.push('LOWER(status) = ?');
                params.push(status.toLowerCase());
              }

              let orderBy = ' ORDER BY intake_time DESC';
              if (sort === 'Sort Name A-Z') orderBy = ' ORDER BY patient_name ASC';
              if (sort === 'Sort Name Z-A') orderBy = ' ORDER BY patient_name DESC';
              const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

              const [countRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM patient_registrations${whereSql}`, params);
              const total = Number(countRows[0]?.total || 0);
              const [rows] = await pool.query<RowDataPacket>(
                `SELECT id, case_id, patient_name, patient_type, patient_email, age, concern, intake_time, booked_time, status, assigned_to
                 FROM patient_registrations${whereSql}${orderBy}
                 LIMIT ? OFFSET ?`,
                [...params, perPage, offset]
              );
              const [pendingRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM patient_registrations WHERE LOWER(status) = 'pending'`);
              const [activeRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM patient_registrations WHERE LOWER(status) = 'active'`);
              const [concernRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM patient_registrations WHERE COALESCE(TRIM(concern), '') <> ''`);
              const [totalRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM patient_registrations`);
              const active = Number(activeRows[0]?.total || 0);
              const totalAll = Number(totalRows[0]?.total || 0);

              writeJson(res, 200, {
                ok: true,
                data: {
                  analytics: {
                    pending: Number(pendingRows[0]?.total || 0),
                    active,
                    concerns: Number(concernRows[0]?.total || 0),
                    approvalRate: totalAll > 0 ? Math.round((active / totalAll) * 100) : 0
                  },
                  items: rows.map(mapRegistrationRow),
                  meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) }
                }
              });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const action = toSafeText(body.action).toLowerCase();
              const id = toSafeInt(body.id, 0);
              const actor = toSafeText(body.actor) || 'System';

              if (action === 'create') {
                const patientName = toSafeText(body.patient_name);
                if (!patientName) {
                  writeJson(res, 422, { ok: false, message: 'patient_name is required.' });
                  return;
                }
                const now = new Date();
                const caseId = `REG-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
                await pool.query(
                  `INSERT INTO patient_registrations (case_id, patient_name, patient_type, patient_email, age, concern, intake_time, booked_time, status, assigned_to)
                   VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP), ?, ?)`,
                  [
                    caseId,
                    patientName,
                    inferPatientType({ patientType: body.patient_type, patientName, patientEmail: body.patient_email, concern: body.concern, age: body.age }),
                    toSafeText(body.patient_email) || null,
                    body.age ?? null,
                    toSafeText(body.concern) || null,
                    toSqlDateTime(body.intake_time),
                    toSqlDateTime(body.booked_time),
                    toSafeText(body.status || 'Pending') || 'Pending',
                    toSafeText(body.assigned_to || 'Unassigned') || 'Unassigned'
                  ]
                );
                const [rows] = await pool.query<RowDataPacket>(`SELECT * FROM patient_registrations WHERE case_id = ? LIMIT 1`, [caseId]);
                await insertModuleActivity(pool, 'registration', 'Registration Created', `Registration ${caseId} created for ${patientName}.`, actor, 'registration', caseId);
                writeJson(res, 200, { ok: true, message: 'Registration created.', data: rows[0] ? mapRegistrationRow(rows[0]) : null });
                return;
              }

              if (!id) {
                writeJson(res, 422, { ok: false, message: 'id is required.' });
                return;
              }

              if (action === 'update') {
                await pool.query(
                  `UPDATE patient_registrations
                   SET patient_name = COALESCE(?, patient_name),
                       patient_type = COALESCE(NULLIF(?, ''), patient_type),
                       patient_email = ?,
                       age = ?,
                       concern = ?,
                       intake_time = COALESCE(?, intake_time),
                       booked_time = COALESCE(?, booked_time),
                       status = COALESCE(?, status),
                       assigned_to = COALESCE(?, assigned_to),
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?`,
                  [
                    toSafeText(body.patient_name) || null,
                    inferPatientType({ patientType: body.patient_type, patientName: body.patient_name, patientEmail: body.patient_email, concern: body.concern, age: body.age }),
                    toSafeText(body.patient_email) || null,
                    body.age ?? null,
                    toSafeText(body.concern) || null,
                    toSqlDateTime(body.intake_time),
                    toSqlDateTime(body.booked_time),
                    toSafeText(body.status) || null,
                    toSafeText(body.assigned_to) || null,
                    id
                  ]
                );
                const updated = await selectRegistrationById(pool, id);
                if (!updated) {
                  writeJson(res, 404, { ok: false, message: 'Registration not found.' });
                  return;
                }
                await insertModuleActivity(pool, 'registration', 'Registration Updated', `Registration ${updated.case_id} updated.`, actor, 'registration', String(updated.case_id));
                writeJson(res, 200, { ok: true, message: 'Registration updated.', data: mapRegistrationRow(updated) });
                return;
              }

              if (action === 'approve' || action === 'set_status') {
                const targetStatus = action === 'approve' ? 'Active' : toSafeText(body.status);
                if (!['pending', 'review', 'active', 'archived'].includes(targetStatus.toLowerCase())) {
                  writeJson(res, 422, { ok: false, message: 'Invalid status transition target.' });
                  return;
                }
                await pool.query(`UPDATE patient_registrations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [targetStatus, id]);
                const updated = await selectRegistrationById(pool, id);
                if (!updated) {
                  writeJson(res, 404, { ok: false, message: 'Registration not found.' });
                  return;
                }
                await insertModuleActivity(pool, 'registration', action === 'approve' ? 'Registration Approved' : 'Registration Status Updated', `Registration ${updated.case_id} status set to ${targetStatus}.`, actor, 'registration', String(updated.case_id));
                writeJson(res, 200, { ok: true, message: `Registration status updated to ${targetStatus}.`, data: mapRegistrationRow(updated) });
                return;
              }

              if (action === 'assign') {
                const assignedTo = toSafeText(body.assigned_to);
                if (!assignedTo) {
                  writeJson(res, 422, { ok: false, message: 'assigned_to is required.' });
                  return;
                }
                await pool.query(`UPDATE patient_registrations SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [assignedTo, id]);
                const updated = await selectRegistrationById(pool, id);
                if (!updated) {
                  writeJson(res, 404, { ok: false, message: 'Registration not found.' });
                  return;
                }
                await insertModuleActivity(pool, 'registration', 'Registration Assigned', `Registration ${updated.case_id} assigned to ${assignedTo}.`, actor, 'registration', String(updated.case_id));
                writeJson(res, 200, { ok: true, message: 'Registration reassigned.', data: mapRegistrationRow(updated) });
                return;
              }

              if (action === 'reject' || action === 'archive') {
                const reason = toSafeText(body.reason);
                if (!reason) {
                  writeJson(res, 422, { ok: false, message: 'reason is required.' });
                  return;
                }
                const existing = await selectRegistrationById(pool, id);
                if (!existing) {
                  writeJson(res, 404, { ok: false, message: 'Registration not found.' });
                  return;
                }
                const reasonLabel = action === 'reject' ? 'Rejection' : 'Archive';
                const nextConcern = `${toSafeText(existing.concern || 'No concern')} | ${reasonLabel}: ${reason}`;
                await pool.query(`UPDATE patient_registrations SET status = 'Archived', concern = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [nextConcern, id]);
                const updated = await selectRegistrationById(pool, id);
                await insertModuleActivity(pool, 'registration', action === 'reject' ? 'Registration Rejected' : 'Registration Archived', `${action === 'reject' ? 'Rejected' : 'Archived'} registration ${existing.case_id}. Reason: ${reason}`, actor, 'registration', String(existing.case_id));
                writeJson(res, 200, { ok: true, message: action === 'reject' ? 'Registration rejected.' : 'Registration archived.', data: updated ? mapRegistrationRow(updated) : null });
                return;
              }

              writeJson(res, 422, { ok: false, message: 'Unsupported action.' });
              return;
            }
          }

          if (url.pathname === '/api/walk-ins') {
            await ensurePatientWalkinsTable(pool);

            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const search = toSafeText(url.searchParams.get('search'));
              const status = toSafeText(url.searchParams.get('status'));
              const severity = toSafeText(url.searchParams.get('severity'));
              const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
              const perPage = Math.min(50, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 10)));
              const offset = (page - 1) * perPage;
              const where: string[] = [];
              const params: unknown[] = [];

              if (search) {
                const searchLike = `%${search.toLowerCase()}%`;
                where.push('(LOWER(case_id) LIKE ? OR LOWER(patient_name) LIKE ? OR LOWER(COALESCE(contact, \'\')) LIKE ? OR LOWER(COALESCE(chief_complaint, \'\')) LIKE ? OR LOWER(COALESCE(assigned_doctor, \'\')) LIKE ?)');
                params.push(searchLike, searchLike, searchLike, searchLike, searchLike);
              }
              if (status && status.toLowerCase() !== 'all') {
                where.push('LOWER(status) = ?');
                params.push(status.toLowerCase());
              }
              if (severity && severity.toLowerCase() !== 'all') {
                where.push('LOWER(severity) = ?');
                params.push(severity.toLowerCase());
              }

              const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
              const [countRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM patient_walkins${whereSql}`, params);
              const total = Number(countRows[0]?.total || 0);
              const [rows] = await pool.query<RowDataPacket>(
                `SELECT id, case_id, patient_name, patient_type, age, sex, date_of_birth, contact, address, emergency_contact, patient_ref, visit_department, checkin_time,
                        pain_scale, temperature_c, blood_pressure, pulse_bpm, weight_kg, chief_complaint, severity, intake_time, assigned_doctor, status
                 FROM patient_walkins${whereSql}
                 ORDER BY
                   CASE WHEN status = 'emergency' OR severity = 'Emergency' THEN 0 ELSE 1 END ASC,
                   CASE severity WHEN 'Emergency' THEN 0 WHEN 'Moderate' THEN 1 ELSE 2 END ASC,
                   intake_time ASC
                 LIMIT ? OFFSET ?`,
                [...params, perPage, offset]
              );
              const [analyticsRows] = await pool.query<RowDataPacket>(
                `SELECT COUNT(*) AS all_count,
                        SUM(CASE WHEN status = 'triage_pending' THEN 1 ELSE 0 END) AS triage_count,
                        SUM(CASE WHEN status = 'waiting_for_doctor' THEN 1 ELSE 0 END) AS doctor_count,
                        SUM(CASE WHEN status = 'emergency' THEN 1 ELSE 0 END) AS emergency_count,
                        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count
                 FROM patient_walkins`
              );
              const analytics = analyticsRows[0] || {};

              writeJson(res, 200, {
                ok: true,
                data: {
                  analytics: {
                    all: Number(analytics.all_count || 0),
                    triage: Number(analytics.triage_count || 0),
                    doctor: Number(analytics.doctor_count || 0),
                    emergency: Number(analytics.emergency_count || 0),
                    completed: Number(analytics.completed_count || 0)
                  },
                  items: rows.map(mapWalkinRow),
                  meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) }
                }
              });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const action = toSafeText(body.action).toLowerCase();
              const actor = toSafeText(body.actor) || 'System';
              const logWalkin = async (actionLabel: string, detail: string, caseKey: string): Promise<void> => {
                await insertModuleActivity(pool, 'walkin', actionLabel, detail, actor, 'walkin_case', caseKey);
              };

              if (action === 'create') {
                const patientName = toSafeText(body.patient_name);
                if (!patientName) {
                  writeJson(res, 422, { ok: false, message: 'patient_name is required.' });
                  return;
                }
                const now = new Date();
                const caseId = `WALK-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${Math.floor(100 + Math.random() * 900)}`;
                await pool.query(
                  `INSERT INTO patient_walkins (
                     case_id, patient_name, patient_type, age, sex, date_of_birth, contact, address, emergency_contact, patient_ref, visit_department,
                     checkin_time, pain_scale, temperature_c, blood_pressure, pulse_bpm, weight_kg, chief_complaint, severity, intake_time, assigned_doctor, status
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, 'waiting')`,
                  [
                    caseId,
                    patientName,
                    inferPatientType({ patientType: body.patient_type, patientName, patientId: body.patient_ref, age: body.age, concern: body.chief_complaint }),
                    body.age ?? null,
                    toSafeText(body.sex) || null,
                    toSqlDate(body.date_of_birth),
                    toSafeText(body.contact) || null,
                    toSafeText(body.address) || null,
                    toSafeText(body.emergency_contact) || null,
                    toSafeText(body.patient_ref) || null,
                    toSafeText(body.visit_department) || null,
                    toSqlDateTime(body.checkin_time),
                    body.pain_scale ?? null,
                    body.temperature_c ?? null,
                    toSafeText(body.blood_pressure) || null,
                    body.pulse_bpm ?? null,
                    body.weight_kg ?? null,
                    toSafeText(body.chief_complaint) || null,
                    toSafeText(body.severity || 'Low') || 'Low',
                    toSqlDateTime(body.checkin_time),
                    toSafeText(body.assigned_doctor || 'Nurse Triage') || 'Nurse Triage'
                  ]
                );
                const [rows] = await pool.query<RowDataPacket>(`SELECT * FROM patient_walkins WHERE case_id = ? LIMIT 1`, [caseId]);
                await logWalkin('Walk-In Created', `Walk-in case ${caseId} created for ${patientName}.`, caseId);
                writeJson(res, 200, { ok: true, message: 'Walk-in created.', data: rows[0] ? mapWalkinRow(rows[0]) : null });
                return;
              }

              const id = toSafeInt(body.id, 0);
              if (!id) {
                writeJson(res, 422, { ok: false, message: 'id is required.' });
                return;
              }
              const current = await selectWalkinById(pool, id);
              if (!current) {
                writeJson(res, 404, { ok: false, message: 'Walk-in case not found.' });
                return;
              }
              const currentStatus = String(current.status || '');

              if (action === 'identify') {
                if (currentStatus !== 'waiting') {
                  writeJson(res, 422, { ok: false, message: 'Only waiting patients can be identified.' });
                  return;
                }
                await pool.query(`UPDATE patient_walkins SET status = 'identified', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'queue_triage') {
                if (currentStatus !== 'identified') {
                  writeJson(res, 422, { ok: false, message: 'Only identified patients can be moved to triage_pending.' });
                  return;
                }
                await pool.query(`UPDATE patient_walkins SET status = 'triage_pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'start_triage') {
                if (currentStatus !== 'triage_pending') {
                  writeJson(res, 422, { ok: false, message: 'Start triage is only allowed from triage_pending.' });
                  return;
                }
                await pool.query(`UPDATE patient_walkins SET status = 'in_triage', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'triage') {
                if (currentStatus !== 'in_triage') {
                  writeJson(res, 422, { ok: false, message: 'Save triage is only allowed from in_triage.' });
                  return;
                }
                const severityValue = toSafeText(body.severity || 'Low') || 'Low';
                const nextStatus = severityValue === 'Emergency' ? 'emergency' : 'waiting_for_doctor';
                await pool.query(
                  `UPDATE patient_walkins
                   SET chief_complaint = COALESCE(?, chief_complaint),
                       severity = ?,
                       status = ?,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?`,
                  [toSafeText(body.chief_complaint) || null, severityValue, nextStatus, id]
                );
              } else if (action === 'assign') {
                if (currentStatus !== 'waiting_for_doctor') {
                  writeJson(res, 422, { ok: false, message: 'Doctor assignment requires waiting_for_doctor status.' });
                  return;
                }
                await pool.query(
                  `UPDATE patient_walkins SET assigned_doctor = COALESCE(?, assigned_doctor), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                  [toSafeText(body.assigned_doctor) || null, id]
                );
              } else if (action === 'complete') {
                if (currentStatus !== 'waiting_for_doctor') {
                  writeJson(res, 422, { ok: false, message: 'Case can only be completed after doctor queue stage.' });
                  return;
                }
                await pool.query(`UPDATE patient_walkins SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'emergency') {
                if (currentStatus === 'completed') {
                  writeJson(res, 422, { ok: false, message: 'Completed case cannot be escalated to emergency.' });
                  return;
                }
                await pool.query(`UPDATE patient_walkins SET status = 'emergency', severity = 'Emergency', assigned_doctor = 'ER Team', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else {
                writeJson(res, 422, { ok: false, message: 'Unsupported action.' });
                return;
              }

              const updated = await selectWalkinById(pool, id);
              const caseKey = toSafeText(updated?.case_id || id);
              await logWalkin(action.replace(/_/g, ' '), `Walk-in action ${action} applied to ${caseKey}.`, caseKey);
              writeJson(res, 200, { ok: true, data: updated ? mapWalkinRow(updated) : null });
              return;
            }
          }

          if (url.pathname === '/api/checkups') {
            await ensureCheckupVisitsTable(pool);

            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const search = toSafeText(url.searchParams.get('search'));
              const status = toSafeText(url.searchParams.get('status'));
              const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
              const perPage = Math.min(50, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 10)));
              const offset = (page - 1) * perPage;
              const where: string[] = [];
              const params: unknown[] = [];

              if (search) {
                const searchLike = `%${search.toLowerCase()}%`;
                where.push('(LOWER(visit_id) LIKE ? OR LOWER(patient_name) LIKE ? OR LOWER(COALESCE(chief_complaint, \'\')) LIKE ? OR LOWER(COALESCE(assigned_doctor, \'\')) LIKE ?)');
                params.push(searchLike, searchLike, searchLike, searchLike);
              }
              if (status && status.toLowerCase() !== 'all') {
                where.push('LOWER(status) = ?');
                params.push(status.toLowerCase());
              }

              const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
              const [countRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM checkup_visits${whereSql}`, params);
              const total = Number(countRows[0]?.total || 0);
              const [rows] = await pool.query<RowDataPacket>(
                `SELECT id, visit_id, patient_name, patient_type, assigned_doctor, source, status, chief_complaint, diagnosis, clinical_notes, consultation_started_at,
                        lab_requested, lab_result_ready, prescription_created, prescription_dispensed, follow_up_date, is_emergency, version, created_at, updated_at
                 FROM checkup_visits${whereSql}
                 ORDER BY CASE WHEN is_emergency = 1 THEN 0 ELSE 1 END ASC, updated_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, perPage, offset]
              );
              const [intakeRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM checkup_visits WHERE status = 'intake' AND is_emergency = 0`);
              const [queueRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM checkup_visits WHERE status = 'queue' AND is_emergency = 0`);
              const [assignedRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM checkup_visits WHERE status = 'doctor_assigned' AND is_emergency = 0`);
              const [consultRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM checkup_visits WHERE status = 'in_consultation' AND is_emergency = 0`);
              const [labRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM checkup_visits WHERE status = 'lab_requested' AND is_emergency = 0`);
              const [pharmacyRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM checkup_visits WHERE status = 'pharmacy' AND is_emergency = 0`);
              const [completedRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM checkup_visits WHERE status = 'completed'`);
              const [emergencyRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM checkup_visits WHERE is_emergency = 1 AND status <> 'archived'`);

              writeJson(res, 200, {
                ok: true,
                data: {
                  items: rows.map(mapCheckupRow),
                  analytics: {
                    intake: Number(intakeRows[0]?.total || 0),
                    queue: Number(queueRows[0]?.total || 0),
                    doctorAssigned: Number(assignedRows[0]?.total || 0),
                    inConsultation: Number(consultRows[0]?.total || 0),
                    labRequested: Number(labRows[0]?.total || 0),
                    pharmacy: Number(pharmacyRows[0]?.total || 0),
                    completed: Number(completedRows[0]?.total || 0),
                    emergency: Number(emergencyRows[0]?.total || 0)
                  },
                  meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) }
                }
              });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const action = toSafeText(body.action).toLowerCase();
              const id = toSafeInt(body.id, 0);
              const expectedVersion = toSafeInt(body.expectedVersion, 0);
              if (!id) {
                writeJson(res, 422, { ok: false, message: 'id is required.' });
                return;
              }
              const current = await selectCheckupById(pool, id);
              if (!current) {
                writeJson(res, 404, { ok: false, message: 'Visit not found.' });
                return;
              }
              const currentStatus = toSafeText(current.status).toLowerCase();
              const currentVersion = Number(current.version || 1);
              if (expectedVersion > 0 && expectedVersion !== currentVersion) {
                writeJson(res, 409, { ok: false, message: 'Visit has been updated by another user. Please refresh.' });
                return;
              }

              const fail = (message: string): void => writeJson(res, 422, { ok: false, message });

              if (action === 'queue') {
                if (currentStatus !== 'intake') return fail('Only intake visits can be queued.');
                await pool.query(`UPDATE checkup_visits SET status = 'queue', version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'assign_doctor') {
                const assignedDoctor = toSafeText(body.assigned_doctor);
                if (!assignedDoctor) return fail('assigned_doctor is required.');
                if (!['queue', 'doctor_assigned', 'in_consultation'].includes(currentStatus)) return fail('Doctor assignment is allowed only for queue/assigned/in_consultation states.');
                await pool.query(`UPDATE checkup_visits SET assigned_doctor = ?, status = CASE WHEN status = 'queue' THEN 'doctor_assigned' ELSE status END, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [assignedDoctor, id]);
              } else if (action === 'start_consultation') {
                if (!['doctor_assigned', 'queue'].includes(currentStatus)) return fail('Consultation can start only from doctor_assigned or queue.');
                await pool.query(`UPDATE checkup_visits SET status = 'in_consultation', consultation_started_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'save_consultation') {
                const diagnosis = toSafeText(body.diagnosis);
                const notes = toSafeText(body.clinical_notes);
                if (!diagnosis || !notes) return fail('diagnosis and clinical_notes are required.');
                if (!['in_consultation', 'lab_requested'].includes(currentStatus)) return fail('Consultation save is allowed only during consultation/lab stage.');
                await pool.query(`UPDATE checkup_visits SET diagnosis = ?, clinical_notes = ?, follow_up_date = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [diagnosis, notes, toSqlDate(body.follow_up_date), id]);
              } else if (action === 'request_lab') {
                if (!['in_consultation', 'doctor_assigned'].includes(currentStatus)) return fail('Lab can only be requested during doctor consultation flow.');
                await pool.query(`UPDATE checkup_visits SET status = 'lab_requested', lab_requested = 1, lab_result_ready = 0, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'mark_lab_ready') {
                if (currentStatus !== 'lab_requested') return fail('Only lab_requested visits can be marked as lab ready.');
                await pool.query(`UPDATE checkup_visits SET status = 'in_consultation', lab_result_ready = 1, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'send_pharmacy') {
                if (!['in_consultation', 'doctor_assigned'].includes(currentStatus)) return fail('Pharmacy routing requires active consultation.');
                await pool.query(`UPDATE checkup_visits SET status = 'pharmacy', prescription_created = 1, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'mark_dispensed') {
                if (currentStatus !== 'pharmacy') return fail('Only pharmacy state can be dispensed.');
                await pool.query(`UPDATE checkup_visits SET prescription_dispensed = 1, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'complete') {
                if (!['in_consultation', 'pharmacy'].includes(currentStatus)) return fail('Only in_consultation or pharmacy visits can be completed.');
                if (!toSafeText(current.diagnosis) || !toSafeText(current.clinical_notes)) return fail('Diagnosis and clinical notes are required before completion.');
                if (toBooleanFlag(current.lab_requested) && !toBooleanFlag(current.lab_result_ready)) return fail('Lab result must be ready before completion.');
                await pool.query(`UPDATE checkup_visits SET status = 'completed', version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'archive') {
                if (currentStatus !== 'completed') return fail('Only completed visits can be archived.');
                await pool.query(`UPDATE checkup_visits SET status = 'archived', version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'reopen') {
                if (!['completed', 'archived'].includes(currentStatus)) return fail('Only completed or archived visits can be reopened.');
                await pool.query(`UPDATE checkup_visits SET status = 'in_consultation', version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else if (action === 'escalate_emergency') {
                if (currentStatus === 'archived') return fail('Archived visits cannot be escalated.');
                await pool.query(`UPDATE checkup_visits SET is_emergency = 1, status = 'in_consultation', version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
              } else {
                return fail('Unsupported check-up action.');
              }

              const updated = await selectCheckupById(pool, id);
              await insertModuleActivity(pool, 'checkup', `Checkup ${action}`, `Check-up action ${action} applied to visit ${toSafeText(updated?.visit_id || id)}.`, toSafeText(body.actor) || 'System', 'checkup_visit', toSafeText(updated?.visit_id || id), { action, id });
              writeJson(res, 200, { ok: true, data: updated ? mapCheckupRow(updated) : null });
              return;
            }
          }

          if (url.pathname === '/api/laboratory') {
            await ensureLaboratoryTables(pool);

            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const requestId = toSafeInt(url.searchParams.get('request_id'), 0);
              const mode = toSafeText(url.searchParams.get('mode')).toLowerCase();
              if (requestId > 0 && mode === 'detail') {
                const [rows] = await pool.query<RowDataPacket>(`SELECT * FROM laboratory_requests WHERE request_id = ? LIMIT 1`, [requestId]);
                if (!rows[0]) {
                  writeJson(res, 404, { ok: false, message: 'Laboratory request not found.' });
                  return;
                }
                writeJson(res, 200, { ok: true, data: mapLabDetailRow(rows[0]) });
                return;
              }
              if (requestId > 0 && mode === 'activity') {
                const [logs] = await pool.query<RowDataPacket>(`SELECT id, request_id, action, details, actor, created_at FROM laboratory_activity_logs WHERE request_id = ? ORDER BY created_at DESC`, [requestId]);
                writeJson(res, 200, { ok: true, data: logs.map((row) => ({ ...row, created_at: formatDateTimeCell(row.created_at) })) });
                return;
              }

              const search = toSafeText(url.searchParams.get('search')).toLowerCase();
              const status = toSafeText(url.searchParams.get('status')).toLowerCase();
              const category = toSafeText(url.searchParams.get('category')).toLowerCase();
              const priority = toSafeText(url.searchParams.get('priority')).toLowerCase();
              const doctor = toSafeText(url.searchParams.get('doctor')).toLowerCase();
              const fromDate = toSqlDate(url.searchParams.get('fromDate'));
              const toDate = toSqlDate(url.searchParams.get('toDate'));
              const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
              const perPage = Math.min(50, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 10)));
              const offset = (page - 1) * perPage;
              const where: string[] = [];
              const params: unknown[] = [];
              if (search) {
                const like = `%${search}%`;
                where.push('(CAST(request_id AS CHAR) LIKE ? OR LOWER(patient_name) LIKE ? OR LOWER(visit_id) LIKE ? OR LOWER(patient_id) LIKE ? OR LOWER(category) LIKE ? OR LOWER(requested_by_doctor) LIKE ?)');
                params.push(like, like, like, like, like, like);
              }
              if (status && status !== 'all') {
                if (status === 'in_progress') where.push(`status IN ('In Progress', 'Result Ready')`);
                else if (status === 'completed') where.push(`status = 'Completed'`);
                else if (status === 'pending') where.push(`status = 'Pending'`);
              }
              if (category && category !== 'all') {
                where.push('LOWER(category) = ?');
                params.push(category);
              }
              if (priority && priority !== 'all') {
                where.push('LOWER(priority) = ?');
                params.push(priority);
              }
              if (doctor && doctor !== 'all') {
                where.push('LOWER(requested_by_doctor) = ?');
                params.push(doctor);
              }
              if (fromDate) {
                where.push('requested_at::date >= ?');
                params.push(fromDate);
              }
              if (toDate) {
                where.push('requested_at::date <= ?');
                params.push(toDate);
              }
              const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
              const [countRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM laboratory_requests${whereSql}`, params);
              const total = Number(countRows[0]?.total || 0);
              const [rows] = await pool.query<RowDataPacket>(
                `SELECT request_id, visit_id, patient_id, patient_name, patient_type, category, priority, status, requested_at, requested_by_doctor
                 FROM laboratory_requests${whereSql}
                 ORDER BY requested_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, perPage, offset]
              );
              const [analyticsRows] = await pool.query<RowDataPacket>(
                `SELECT COUNT(*) AS totalRequests,
                        SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending,
                        SUM(CASE WHEN status IN ('In Progress', 'Result Ready') THEN 1 ELSE 0 END) AS inProgress,
                        SUM(CASE WHEN status = 'Completed' AND DATE(requested_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS completedToday,
                        SUM(CASE WHEN priority IN ('Urgent', 'STAT') AND status <> 'Completed' THEN 1 ELSE 0 END) AS urgent,
                        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed
                 FROM laboratory_requests`
              );
              writeJson(res, 200, {
                ok: true,
                data: {
                  analytics: {
                    totalRequests: Number((analyticsRows[0] as any)?.totalRequests || 0),
                    pending: Number((analyticsRows[0] as any)?.pending || 0),
                    inProgress: Number((analyticsRows[0] as any)?.inProgress || 0),
                    completedToday: Number((analyticsRows[0] as any)?.completedToday || 0),
                    urgent: Number((analyticsRows[0] as any)?.urgent || 0),
                    completed: Number((analyticsRows[0] as any)?.completed || 0)
                  },
                  items: rows.map((row) => ({ ...row, requested_at: formatDateTimeCell(row.requested_at) })),
                  meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) }
                }
              });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const action = toSafeText(body.action).toLowerCase();
              const saveActivity = async (requestId: number, actionLabel: string, details: string, actor: string): Promise<void> => {
                await pool.query(`INSERT INTO laboratory_activity_logs (request_id, action, details, actor) VALUES (?, ?, ?, ?)`, [requestId, actionLabel, details, actor || 'Lab Staff']);
                await insertModuleActivity(pool, 'laboratory', actionLabel, details, actor || 'Lab Staff', 'lab_request', String(requestId));
              };

              if (action === 'create') {
                const patientName = toSafeText(body.patient_name);
                const categoryText = toSafeText(body.category);
                const requestedByDoctor = toSafeText(body.requested_by_doctor);
                if (!patientName || !categoryText || !requestedByDoctor) {
                  writeJson(res, 422, { ok: false, message: 'patient_name, category, requested_by_doctor are required.' });
                  return;
                }
                const [nextRows] = await pool.query<RowDataPacket>(`SELECT COALESCE(MAX(request_id), 1200) + 1 AS next_id FROM laboratory_requests`);
                const nextId = Number(nextRows[0]?.next_id || 1201);
                const tests = Array.isArray(body.tests) ? body.tests.map((item) => toSafeText(item)).filter(Boolean) : [`${categoryText} request`];
                await pool.query(
                  `INSERT INTO laboratory_requests (
                    request_id, visit_id, patient_id, patient_name, patient_type, age, sex, category, priority, status, requested_at,
                    requested_by_doctor, doctor_department, notes, tests, specimen_type, sample_source, collection_date_time,
                    clinical_diagnosis, lab_instructions, insurance_reference, billing_reference, assigned_lab_staff,
                    sample_collected, result_reference_range, verified_by, rejection_reason, resample_flag, raw_attachment_name, encoded_values
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', '', '', 0, '', ?)` ,
                  [
                    nextId,
                    toSafeText(body.visit_id) || `VISIT-${new Date().getFullYear()}-${nextId}`,
                    toSafeText(body.patient_id) || `PAT-${nextId}`,
                    patientName,
                    inferPatientType({ patientType: body.patient_type, patientName, patientId: body.patient_id, age: body.age }),
                    toSafeInt(body.age, 0) || null,
                    toSafeText(body.sex) || null,
                    categoryText,
                    toSafeText(body.priority) || 'Normal',
                    requestedByDoctor,
                    toSafeText(body.doctor_department) || 'General Medicine',
                    toSafeText(body.notes) || null,
                    JSON.stringify(tests),
                    toSafeText(body.specimen_type) || 'Whole Blood',
                    toSafeText(body.sample_source) || 'Blood',
                    toSqlDateTime(body.collection_date_time),
                    toSafeText(body.clinical_diagnosis) || null,
                    toSafeText(body.lab_instructions) || null,
                    toSafeText(body.insurance_reference) || null,
                    toSafeText(body.billing_reference) || null,
                    toSafeText(body.assigned_lab_staff) || 'Tech Anne',
                    JSON.stringify({})
                  ]
                );
                const [rows] = await pool.query<RowDataPacket>(`SELECT * FROM laboratory_requests WHERE request_id = ? LIMIT 1`, [nextId]);
                await saveActivity(nextId, 'Request Created', 'New lab request created from laboratory queue dashboard.', 'Lab Staff');
                await queueCashierIntegrationEvent(pool, {
                  sourceModule: 'laboratory',
                  sourceEntity: 'lab_request',
                  sourceKey: String(nextId),
                  patientName,
                  patientType: inferPatientType({ patientType: body.patient_type, patientName, patientId: body.patient_id, age: body.age }),
                  referenceNo: toSafeText(body.billing_reference) || `BILL-LAB-${nextId}`,
                  amountDue: toSafeMoney(body.amount_due, 0),
                  paymentStatus: normalizePaymentStatus(body.payment_status),
                  payload: {
                    requestId: nextId,
                    category: categoryText,
                    requestedByDoctor,
                    billingReference: toSafeText(body.billing_reference) || null
                  }
                });
                writeJson(res, 200, { ok: true, data: rows[0] ? mapLabDetailRow(rows[0]) : null });
                return;
              }

              const requestId = toSafeInt(body.request_id, 0);
              if (requestId <= 0) {
                writeJson(res, 422, { ok: false, message: 'request_id is required.' });
                return;
              }
              const [existingRows] = await pool.query<RowDataPacket>(`SELECT * FROM laboratory_requests WHERE request_id = ? LIMIT 1`, [requestId]);
              const existing = existingRows[0];
              if (!existing) {
                writeJson(res, 404, { ok: false, message: 'Laboratory request not found.' });
                return;
              }

              if (action === 'start_processing') {
                const staff = toSafeText(body.lab_staff) || toSafeText(existing.assigned_lab_staff) || 'Lab Staff';
                await pool.query(
                  `UPDATE laboratory_requests
                   SET status = 'In Progress', assigned_lab_staff = ?, sample_collected = ?, sample_collected_at = CASE WHEN ? = 1 THEN COALESCE(?, CURRENT_TIMESTAMP) ELSE NULL END,
                       processing_started_at = COALESCE(?, CURRENT_TIMESTAMP), specimen_type = COALESCE(NULLIF(?, ''), specimen_type), sample_source = COALESCE(NULLIF(?, ''), sample_source),
                       collection_date_time = COALESCE(?, collection_date_time), updated_at = CURRENT_TIMESTAMP
                   WHERE request_id = ?`,
                  [staff, toBooleanFlag(body.sample_collected) ? 1 : 0, toBooleanFlag(body.sample_collected) ? 1 : 0, toSqlDateTime(body.sample_collected_at), toSqlDateTime(body.processing_started_at), toSafeText(body.specimen_type), toSafeText(body.sample_source), toSqlDateTime(body.collection_date_time), requestId]
                );
                const [rows] = await pool.query<RowDataPacket>(`SELECT * FROM laboratory_requests WHERE request_id = ? LIMIT 1`, [requestId]);
                await saveActivity(requestId, 'Processing Started', 'Sample collected and processing started.', staff);
                writeJson(res, 200, { ok: true, data: rows[0] ? mapLabDetailRow(rows[0]) : null });
                return;
              }

              if (action === 'save_results') {
                const finalize = toBooleanFlag(body.finalize);
                const summary = toSafeText(body.summary) || (finalize ? 'Result is now ready for release.' : 'Encoded result draft saved.');
                await pool.query(
                  `UPDATE laboratory_requests
                   SET status = ?, raw_attachment_name = COALESCE(NULLIF(?, ''), raw_attachment_name), encoded_values = ?, result_encoded_at = CASE WHEN ? = 'Result Ready' THEN COALESCE(?, CURRENT_TIMESTAMP) ELSE result_encoded_at END,
                       result_reference_range = COALESCE(NULLIF(?, ''), result_reference_range), verified_by = CASE WHEN ? = 'Result Ready' THEN COALESCE(NULLIF(?, ''), verified_by, assigned_lab_staff) ELSE verified_by END,
                       verified_at = CASE WHEN ? = 'Result Ready' THEN COALESCE(?, CURRENT_TIMESTAMP) ELSE verified_at END, updated_at = CURRENT_TIMESTAMP
                   WHERE request_id = ?`,
                  [finalize ? 'Result Ready' : 'In Progress', toSafeText(body.attachment_name), JSON.stringify(parseJsonRecord(body.encoded_values)), finalize ? 'Result Ready' : 'In Progress', toSqlDateTime(body.result_encoded_at), toSafeText(body.result_reference_range), finalize ? 'Result Ready' : 'In Progress', toSafeText(body.verified_by), finalize ? 'Result Ready' : 'In Progress', toSqlDateTime(body.verified_at), requestId]
                );
                const [rows] = await pool.query<RowDataPacket>(`SELECT * FROM laboratory_requests WHERE request_id = ? LIMIT 1`, [requestId]);
                await saveActivity(requestId, finalize ? 'Result Finalized' : 'Draft Saved', summary, toSafeText(existing.assigned_lab_staff) || 'Lab Staff');
                writeJson(res, 200, { ok: true, data: rows[0] ? mapLabDetailRow(rows[0]) : null });
                return;
              }

              if (action === 'release') {
                if (toSafeText(existing.status) !== 'Result Ready') {
                  writeJson(res, 422, { ok: false, message: 'Only Result Ready requests can be released.' });
                  return;
                }
                await pool.query(`UPDATE laboratory_requests SET status = 'Completed', released_at = COALESCE(?, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE request_id = ?`, [toSqlDateTime(body.released_at), requestId]);
                const [rows] = await pool.query<RowDataPacket>(`SELECT * FROM laboratory_requests WHERE request_id = ? LIMIT 1`, [requestId]);
                await saveActivity(requestId, 'Report Released', 'Lab report released to doctor/check-up.', toSafeText(body.released_by) || 'Lab Staff');
                await queueCashierIntegrationEvent(pool, {
                  sourceModule: 'laboratory',
                  sourceEntity: 'lab_request',
                  sourceKey: String(requestId),
                  patientName: toSafeText(rows[0]?.patient_name),
                  patientType: toSafeText(rows[0]?.patient_type),
                  referenceNo: toSafeText(rows[0]?.billing_reference) || `BILL-LAB-${requestId}`,
                  amountDue: toSafeMoney(body.amount_due ?? rows[0]?.amount_due, 0),
                  paymentStatus: normalizePaymentStatus(body.payment_status),
                  payload: {
                    requestId,
                    category: toSafeText(rows[0]?.category),
                    status: 'Completed',
                    releasedAt: toSafeText(rows[0]?.released_at) || null
                  }
                });
                writeJson(res, 200, { ok: true, data: rows[0] ? mapLabDetailRow(rows[0]) : null });
                return;
              }

              if (action === 'reject') {
                const reason = toSafeText(body.reason);
                if (!reason) {
                  writeJson(res, 422, { ok: false, message: 'reason is required.' });
                  return;
                }
                await pool.query(`UPDATE laboratory_requests SET status = 'Cancelled', rejection_reason = ?, resample_flag = ?, updated_at = CURRENT_TIMESTAMP WHERE request_id = ?`, [reason, toBooleanFlag(body.resample_flag) ? 1 : 0, requestId]);
                const [rows] = await pool.query<RowDataPacket>(`SELECT * FROM laboratory_requests WHERE request_id = ? LIMIT 1`, [requestId]);
                await saveActivity(requestId, toBooleanFlag(body.resample_flag) ? 'Resample Requested' : 'Request Rejected', reason, toSafeText(body.actor) || 'Lab Staff');
                writeJson(res, 200, { ok: true, data: rows[0] ? mapLabDetailRow(rows[0]) : null });
                return;
              }

              writeJson(res, 422, { ok: false, message: 'Unsupported laboratory action.' });
              return;
            }
          }

          if (url.pathname === '/api/pharmacy') {
            await ensurePharmacyInventoryTables(pool);
            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const search = toSafeText(url.searchParams.get('search')).toLowerCase();
              const category = toSafeText(url.searchParams.get('category'));
              const stock = toSafeText(url.searchParams.get('stock'));
              const quickFilter = toSafeText(url.searchParams.get('quick_filter'));
              const sort = toSafeText(url.searchParams.get('sort')) || 'stock';
              const dir = toSafeText(url.searchParams.get('dir')) || 'asc';
              const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
              const perPage = Math.min(100, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 6)));
              const offset = (page - 1) * perPage;

              const where: string[] = ['is_archived = 0'];
              const params: unknown[] = [];

              if (search) {
                const like = `%${search}%`;
                where.push('(CAST(id AS CHAR) LIKE ? OR LOWER(medicine_name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(medicine_type) LIKE ?)');
                params.push(like, like, like, like);
              }
              if (category && category !== 'All Categories') {
                where.push('category = ?');
                params.push(category);
              }
              const applyStockFilter = (s: string) => {
                if (s === 'Out of Stock' || s === 'out') where.push('stock_on_hand <= 0');
                else if (s === 'Low' || s === 'low') where.push('stock_on_hand > 0 AND stock_on_hand <= low_stock_threshold');
                else if (s === 'Healthy' || s === 'healthy') where.push('stock_on_hand > low_stock_threshold');
                else if (s === 'Expiring' || s === 'expiring') where.push("expiry_date IS NOT NULL AND expiry_date != '' AND CAST(expiry_date AS DATE) <= CURRENT_DATE + INTERVAL 30 DAY AND CAST(expiry_date AS DATE) >= CURRENT_DATE");
              };
              applyStockFilter(stock);
              if (quickFilter !== 'all') applyStockFilter(quickFilter);

              let orderSql = 'ORDER BY medicine_name ASC';
              const dirSql = dir.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
              if (sort === 'name') orderSql = `ORDER BY medicine_name ${dirSql}`;
              else if (sort === 'stock') orderSql = `ORDER BY CASE WHEN stock_capacity > 0 THEN (stock_on_hand * 1.0) / stock_capacity ELSE 0 END ${dirSql}`;
              else if (sort === 'type') orderSql = `ORDER BY medicine_type ${dirSql}`;
              else if (sort === 'expiry') orderSql = `ORDER BY CASE WHEN expiry_date IS NOT NULL AND expiry_date != '' THEN CAST(expiry_date AS DATE) ELSE '9999-12-31' END ${dirSql}`;

              const whereSql = `WHERE ${where.join(' AND ')}`;
              const [countRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM pharmacy_medicines ${whereSql}`, params);
              const total = Number(countRows[0]?.total || 0);

              const [medicines] = await pool.query<RowDataPacket>(
                `SELECT * FROM pharmacy_medicines ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
                [...params, perPage, offset]
              );
              
              const [analyticsRows] = await pool.query<RowDataPacket>(
                `SELECT 
                   COUNT(*) AS total_medicines,
                   SUM(CASE WHEN stock_on_hand <= 0 THEN 1 ELSE 0 END) AS out_of_stock,
                   SUM(CASE WHEN stock_on_hand > 0 AND stock_on_hand <= low_stock_threshold THEN 1 ELSE 0 END) AS low_stock,
                   SUM(CASE WHEN stock_on_hand > low_stock_threshold THEN 1 ELSE 0 END) AS healthy_stock,
                   SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date != '' AND CAST(expiry_date AS DATE) <= CURRENT_DATE + INTERVAL 30 DAY AND CAST(expiry_date AS DATE) >= CURRENT_DATE THEN 1 ELSE 0 END) AS expiring_stock
                 FROM pharmacy_medicines WHERE is_archived = 0`
              );
              const [catsRows] = await pool.query<RowDataPacket>(`SELECT DISTINCT category FROM pharmacy_medicines WHERE is_archived = 0 AND category IS NOT NULL AND category != ''`);
              const catNames = catsRows.map((r) => r.category);

              const [requests] = await pool.query<RowDataPacket>(`SELECT r.*, m.medicine_name FROM pharmacy_dispense_requests r JOIN pharmacy_medicines m ON m.id = r.medicine_id ORDER BY r.requested_at DESC`);
              const pendingRequestsCount = requests.filter(r => r.status === 'Pending').length;

              const analytics = {
                totalMedicines: Number(analyticsRows[0]?.total_medicines || 0),
                out: Number(analyticsRows[0]?.out_of_stock || 0),
                low: Number(analyticsRows[0]?.low_stock || 0),
                healthy: Number(analyticsRows[0]?.healthy_stock || 0),
                expiring: Number(analyticsRows[0]?.expiring_stock || 0),
                pending: pendingRequestsCount,
                categories: catNames
              };

              const [logs] = await pool.query<RowDataPacket>(`SELECT id, detail, actor, tone, created_at FROM pharmacy_activity_logs ORDER BY created_at DESC LIMIT 200`);
              const [movements] = await pool.query<RowDataPacket>(`SELECT id, medicine_id, movement_type, quantity_change, quantity_before, quantity_after, reason, batch_lot_no, stock_location, actor, created_at FROM pharmacy_stock_movements ORDER BY created_at DESC LIMIT 600`);
              writeJson(res, 200, { ok: true, data: { medicines, requests, logs, movements, analytics, meta: { total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) } } });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const action = toSafeText(body.action).toLowerCase();
              const actor = toSafeText(body.role) || 'Pharmacist';
              const medicineId = toSafeInt(body.medicine_id, 0);
              const log = async (actionLabel: string, detail: string, tone = 'info'): Promise<void> => {
                await pool.query(`INSERT INTO pharmacy_activity_logs (action, detail, actor, tone) VALUES (?, ?, ?, ?)`, [actionLabel, detail, actor, tone]);
                await insertModuleActivity(pool, 'pharmacy', actionLabel, detail, actor, 'medicine', medicineId ? String(medicineId) : null);
              };
              const movement = async (id: number, movementType: string, delta: number, before: number, after: number, reason: string, batchLotNo: string | null, stockLocation: string | null): Promise<void> => {
                await pool.query(`INSERT INTO pharmacy_stock_movements (medicine_id, movement_type, quantity_change, quantity_before, quantity_after, reason, batch_lot_no, stock_location, actor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, movementType, delta, before, after, reason, batchLotNo, stockLocation, actor]);
              };

              if (action === 'save_draft') {
                await log('DRAFT', `${toSafeText(body.draft_type) || 'general'}: ${toSafeText(body.notes) || 'Draft saved'}`);
                writeJson(res, 200, { ok: true, message: 'Draft saved.' });
                return;
              }

              if (action === 'create_medicine') {
                const sku = toSafeText(body.sku);
                const medicineName = toSafeText(body.medicine_name);
                const batchLotNo = toSafeText(body.batch_lot_no);
                const expiryDate = toSqlDate(body.expiry_date);
                if (!sku || !medicineName || !batchLotNo || !expiryDate) {
                  writeJson(res, 422, { ok: false, message: 'sku, medicine_name, batch_lot_no, and expiry_date are required.' });
                  return;
                }
                const [dupes] = await pool.query<RowDataPacket>(`SELECT id FROM pharmacy_medicines WHERE sku = ? LIMIT 1`, [sku]);
                if (dupes[0]) {
                  writeJson(res, 409, { ok: false, message: 'SKU already exists.' });
                  return;
                }
                const initialStock = Math.max(0, toSafeInt(body.stock_on_hand, 0));
                await pool.query(
                  `INSERT INTO pharmacy_medicines (medicine_code, sku, medicine_name, brand_name, generic_name, category, medicine_type, dosage_strength, unit_of_measure, supplier_name, purchase_cost, selling_price, batch_lot_no, manufacturing_date, expiry_date, storage_requirements, reorder_level, low_stock_threshold, stock_capacity, stock_on_hand, stock_location, barcode)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [`MED-${Math.floor(10000 + Math.random() * 89999)}`, sku, medicineName, toSafeText(body.brand_name) || null, toSafeText(body.generic_name) || null, toSafeText(body.category) || 'Tablet', toSafeText(body.medicine_type) || 'General', toSafeText(body.dosage_strength) || null, toSafeText(body.unit_of_measure) || 'unit', toSafeText(body.supplier_name) || null, toSafeMoney(body.purchase_cost, 0), toSafeMoney(body.selling_price, 0), batchLotNo, toSqlDate(body.manufacturing_date), expiryDate, toSafeText(body.storage_requirements) || null, Math.max(0, toSafeInt(body.reorder_level, 20)), Math.max(0, toSafeInt(body.low_stock_threshold, 20)), Math.max(0, toSafeInt(body.stock_capacity, 100)), initialStock, toSafeText(body.stock_location) || null, toSafeText(body.barcode) || null]
                );
                const [rows] = await pool.query<RowDataPacket>(`SELECT * FROM pharmacy_medicines WHERE sku = ? LIMIT 1`, [sku]);
                const created = rows[0];
                await movement(Number(created.id || 0), 'add', initialStock, 0, initialStock, 'Initial stock added', toSafeText(created.batch_lot_no) || null, toSafeText(created.stock_location) || null);
                await log('ADD_MEDICINE', `${medicineName} created with stock ${initialStock}`, 'success');
                writeJson(res, 200, { ok: true, message: 'Medicine created.' });
                return;
              }

              if (!medicineId && !['fulfill_request'].includes(action)) {
                writeJson(res, 422, { ok: false, message: 'medicine_id is required.' });
                return;
              }

              if (action === 'update_medicine') {
                await pool.query(`UPDATE pharmacy_medicines SET category = COALESCE(?, category), medicine_type = COALESCE(?, medicine_type), supplier_name = COALESCE(?, supplier_name), dosage_strength = COALESCE(?, dosage_strength), unit_of_measure = COALESCE(?, unit_of_measure), stock_capacity = COALESCE(?, stock_capacity), low_stock_threshold = COALESCE(?, low_stock_threshold), reorder_level = COALESCE(?, reorder_level), expiry_date = COALESCE(?, expiry_date), stock_location = COALESCE(?, stock_location), storage_requirements = COALESCE(?, storage_requirements), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_archived = 0`, [toSafeText(body.category) || null, toSafeText(body.medicine_type) || null, toSafeText(body.supplier_name) || null, toSafeText(body.dosage_strength) || null, toSafeText(body.unit_of_measure) || null, Math.max(0, toSafeInt(body.stock_capacity, 0)) || null, Math.max(0, toSafeInt(body.low_stock_threshold, 0)) || null, Math.max(0, toSafeInt(body.reorder_level, 0)) || null, toSqlDate(body.expiry_date), toSafeText(body.stock_location) || null, toSafeText(body.storage_requirements) || null, medicineId]);
                await log('UPDATE_MEDICINE', `Medicine #${medicineId} updated`, 'success');
                writeJson(res, 200, { ok: true, message: 'Medicine updated.' });
                return;
              }

              const [medicineRows] = await pool.query<RowDataPacket>(`SELECT * FROM pharmacy_medicines WHERE id = ? AND is_archived = 0 LIMIT 1`, [medicineId]);
              const medicine = medicineRows[0];
              if (!medicine && action !== 'fulfill_request') {
                writeJson(res, 404, { ok: false, message: 'Medicine not found.' });
                return;
              }

              if (action === 'archive_medicine') {
                await pool.query(`UPDATE pharmacy_medicines SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [medicineId]);
                await movement(medicineId, 'archive', 0, Number(medicine.stock_on_hand || 0), Number(medicine.stock_on_hand || 0), 'Medicine archived', toSafeText(medicine.batch_lot_no) || null, toSafeText(medicine.stock_location) || null);
                await log('ARCHIVE_MEDICINE', `${medicine.medicine_name} archived`);
                writeJson(res, 200, { ok: true, message: 'Medicine archived.' });
                return;
              }

              if (action === 'restock' || action === 'adjust_stock') {
                const before = Number(medicine.stock_on_hand || 0);
                let after = before;
                let delta = 0;
                if (action === 'restock') {
                  const quantity = Math.max(0, toSafeInt(body.quantity, 0));
                  if (!quantity) {
                    writeJson(res, 422, { ok: false, message: 'quantity must be greater than 0.' });
                    return;
                  }
                  after = before + quantity;
                  delta = quantity;
                } else {
                  const mode = toSafeText(body.mode).toLowerCase();
                  const quantity = Math.max(0, toSafeInt(body.quantity, 0));
                  if (!['increase', 'decrease', 'set'].includes(mode)) {
                    writeJson(res, 422, { ok: false, message: 'mode and reason are required.' });
                    return;
                  }
                  if (mode === 'increase') after = before + quantity;
                  if (mode === 'decrease') after = Math.max(0, before - quantity);
                  if (mode === 'set') after = quantity;
                  delta = after - before;
                }
                await pool.query(`UPDATE pharmacy_medicines SET stock_on_hand = ?, supplier_name = COALESCE(?, supplier_name), batch_lot_no = COALESCE(?, batch_lot_no), expiry_date = COALESCE(?, expiry_date), purchase_cost = COALESCE(?, purchase_cost), stock_location = COALESCE(?, stock_location), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [after, toSafeText(body.supplier_name) || null, toSafeText(body.batch_lot_no) || null, toSqlDate(body.expiry_date), toSafeMoney(body.purchase_cost, 0) || null, toSafeText(body.stock_location) || null, medicineId]);
                await movement(medicineId, action === 'restock' ? 'restock' : 'adjust', delta, before, after, toSafeText(body.reason) || (action === 'restock' ? 'Restocked' : 'Adjusted'), toSafeText(body.batch_lot_no) || toSafeText(medicine.batch_lot_no) || null, toSafeText(body.stock_location) || toSafeText(medicine.stock_location) || null);
                await log(action === 'restock' ? 'RESTOCK' : 'ADJUST', `${medicine.medicine_name} ${action === 'restock' ? `restocked +${delta}` : `adjusted ${before} -> ${after}`}`, action === 'restock' ? 'success' : 'info');
                writeJson(res, 200, { ok: true, message: action === 'restock' ? 'Medicine restocked.' : 'Stock adjusted.' });
                return;
              }

              if (action === 'dispense') {
                const patientName = toSafeText(body.patient_name);
                const prescriptionReference = toSafeText(body.prescription_reference);
                const dispenseReason = toSafeText(body.dispense_reason);
                const quantity = Math.max(0, toSafeInt(body.quantity, 0));
                if (!patientName || !prescriptionReference || !dispenseReason || !quantity) {
                  writeJson(res, 422, { ok: false, message: 'patient_name, quantity, prescription_reference, and dispense_reason are required.' });
                  return;
                }
                const before = Number(medicine.stock_on_hand || 0);
                if (before < quantity) {
                  writeJson(res, 422, { ok: false, message: `Insufficient stock. Available: ${before}` });
                  return;
                }
                const after = before - quantity;
                await pool.query(`UPDATE pharmacy_medicines SET stock_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [after, medicineId]);
                const requestCode = `DSP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
                await pool.query(`INSERT INTO pharmacy_dispense_requests (request_code, medicine_id, patient_name, quantity, notes, prescription_reference, dispense_reason, status, requested_at, fulfilled_at, fulfilled_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'Fulfilled', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`, [requestCode, medicineId, patientName, quantity, toSafeText(body.notes) || null, prescriptionReference, dispenseReason, actor]);
                await movement(medicineId, 'dispense', -quantity, before, after, `Dispensed for ${patientName}`, toSafeText(medicine.batch_lot_no) || null, toSafeText(medicine.stock_location) || null);
                await log('DISPENSE', `${medicine.medicine_name} dispensed -${quantity} for ${patientName}`);
                await queueCashierIntegrationEvent(pool, {
                  sourceModule: 'pharmacy',
                  sourceEntity: 'dispense_request',
                  sourceKey: requestCode,
                  patientName,
                  patientType: body.patient_type == null ? 'unknown' : toSafeText(body.patient_type),
                  referenceNo: prescriptionReference,
                  amountDue: Number(medicine.selling_price || 0) * quantity,
                  paymentStatus: normalizePaymentStatus(body.payment_status),
                  payload: {
                    requestCode,
                    medicineId,
                    medicineName: toSafeText(medicine.medicine_name),
                    quantity,
                    unitPrice: Number(medicine.selling_price || 0),
                    actor
                  }
                });
                writeJson(res, 200, { ok: true, message: 'Medicine dispensed.' });
                return;
              }

              if (action === 'fulfill_request') {
                const requestId = toSafeInt(body.request_id, 0);
                if (!requestId) {
                  writeJson(res, 422, { ok: false, message: 'request_id is required.' });
                  return;
                }
                const [requestRows] = await pool.query<RowDataPacket>(`SELECT r.*, m.medicine_name, m.stock_on_hand, m.batch_lot_no, m.stock_location, m.selling_price FROM pharmacy_dispense_requests r JOIN pharmacy_medicines m ON m.id = r.medicine_id WHERE r.id = ? LIMIT 1`, [requestId]);
                const request = requestRows[0];
                if (!request) {
                  writeJson(res, 404, { ok: false, message: 'Request not found.' });
                  return;
                }
                if (String(request.status) !== 'Pending') {
                  writeJson(res, 422, { ok: false, message: 'Only pending requests can be fulfilled.' });
                  return;
                }
                const before = Number(request.stock_on_hand || 0);
                const qty = Number(request.quantity || 0);
                if (before < qty) {
                  writeJson(res, 422, { ok: false, message: `Insufficient stock. Available: ${before}` });
                  return;
                }
                const after = before - qty;
                await pool.query(`UPDATE pharmacy_medicines SET stock_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [after, Number(request.medicine_id || 0)]);
                await pool.query(`UPDATE pharmacy_dispense_requests SET status = 'Fulfilled', fulfilled_at = CURRENT_TIMESTAMP, fulfilled_by = ? WHERE id = ?`, [actor, requestId]);
                await movement(Number(request.medicine_id || 0), 'dispense', -qty, before, after, `Request #${request.id} fulfilled for ${request.patient_name}`, toSafeText(request.batch_lot_no) || null, toSafeText(request.stock_location) || null);
                await log('FULFILL_REQUEST', `Request #${request.id} fulfilled (${request.medicine_name} -${qty})`, 'success');
                await queueCashierIntegrationEvent(pool, {
                  sourceModule: 'pharmacy',
                  sourceEntity: 'dispense_request',
                  sourceKey: String(request.id),
                  patientName: toSafeText(request.patient_name),
                  patientType: 'unknown',
                  referenceNo: toSafeText(request.prescription_reference) || String(request.id),
                  amountDue: Number(request.selling_price || 0) * qty,
                  paymentStatus: normalizePaymentStatus(body.payment_status),
                  payload: {
                    requestId: Number(request.id || 0),
                    medicineId: Number(request.medicine_id || 0),
                    medicineName: toSafeText(request.medicine_name),
                    quantity: qty,
                    unitPrice: Number(request.selling_price || 0),
                    actor
                  }
                });
                writeJson(res, 200, { ok: true, message: 'Request fulfilled.' });
                return;
              }

              writeJson(res, 422, { ok: false, message: 'Unsupported pharmacy action.' });
              return;
            }
          }

          if (url.pathname === '/api/mental-health') {
            await ensureMentalHealthTables(pool);
            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const search = toSafeText(url.searchParams.get('search')).toLowerCase();
              const status = toSafeText(url.searchParams.get('status')).toLowerCase();
              const risk = toSafeText(url.searchParams.get('risk')).toLowerCase();
              const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
              const perPage = Math.min(100, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 8)));
              const offset = (page - 1) * perPage;

              const where: string[] = [];
              const params: unknown[] = [];
              if (search) {
                const like = `%${search}%`;
                where.push('(LOWER(case_reference) LIKE ? OR LOWER(patient_name) LIKE ? OR LOWER(patient_id) LIKE ? OR LOWER(counselor) LIKE ? OR LOWER(session_type) LIKE ?)');
                params.push(like, like, like, like, like);
              }
              if (status && status !== 'all') {
                where.push('LOWER(status) = ?');
                params.push(status);
              }
              if (risk && risk !== 'all') {
                where.push('LOWER(risk_level) = ?');
                params.push(risk);
              }
              const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

              const [countRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM mental_health_sessions ${whereSql}`, params);
              const total = Number(countRows[0]?.total || 0);
              const [sessions] = await pool.query<RowDataPacket>(
                `SELECT * FROM mental_health_sessions ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
                [...params, perPage, offset]
              );
              const [patients] = await pool.query<RowDataPacket>(`SELECT p.patient_id, p.patient_name, p.patient_type, COUNT(s.id) AS previous_sessions, MAX(s.case_reference) AS latest_case_reference FROM mental_health_patients p LEFT JOIN mental_health_sessions s ON s.patient_id = p.patient_id GROUP BY p.patient_id, p.patient_name, p.patient_type ORDER BY p.patient_name ASC`);
              const [notes] = await pool.query<RowDataPacket>(`SELECT * FROM mental_health_notes ORDER BY created_at DESC LIMIT 250`);
              const [activities] = await pool.query<RowDataPacket>(`SELECT * FROM mental_health_activity_logs ORDER BY created_at DESC LIMIT 250`);
              const [analyticsRows] = await pool.query<RowDataPacket>(`SELECT SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status = 'follow_up' THEN 1 ELSE 0 END) AS follow_up, SUM(CASE WHEN status = 'at_risk' THEN 1 ELSE 0 END) AS at_risk, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed, SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) AS escalated, SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived FROM mental_health_sessions`);
              writeJson(res, 200, { ok: true, data: { sessions: sessions.map((row) => ({ ...row, appointment_at: formatDateTimeCell(row.appointment_at), next_follow_up_at: row.next_follow_up_at == null ? null : formatDateTimeCell(row.next_follow_up_at), created_at: formatDateTimeCell(row.created_at), updated_at: formatDateTimeCell(row.updated_at), is_draft: toBooleanFlag(row.is_draft) })), patients, notes: notes.map((row) => ({ ...row, created_at: formatDateTimeCell(row.created_at) })), activities: activities.map((row) => ({ ...row, created_at: formatDateTimeCell(row.created_at) })), meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) }, analytics: analyticsRows[0] || { active: 0, follow_up: 0, at_risk: 0, completed: 0, escalated: 0, archived: 0 } } });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const action = toSafeText(body.action).toLowerCase();
              const role = toSafeText(body.role) || 'Counselor';
              const sessionId = toSafeInt(body.session_id, 0);
              const saveActivity = async (id: number | null, name: string, detail: string): Promise<void> => {
                await pool.query(`INSERT INTO mental_health_activity_logs (session_id, action, detail, actor_role) VALUES (?, ?, ?, ?)`, [id, name, detail, role]);
                await insertModuleActivity(pool, 'mental_health', name, detail, role, 'mental_session', id ? String(id) : null);
              };

              if (action === 'save_draft') {
                await saveActivity(sessionId || null, 'DRAFT_SAVED', toSafeText(body.detail) || 'Draft saved');
                writeJson(res, 200, { ok: true, message: 'Draft saved.' });
                return;
              }

              if (action === 'create_session') {
                const patientId = toSafeText(body.patient_id);
                const patientName = toSafeText(body.patient_name);
                const counselor = toSafeText(body.counselor);
                const sessionType = toSafeText(body.session_type);
                const appointmentAt = toSqlDateTime(body.appointment_at);
                if (!patientId || !patientName || !counselor || !sessionType || !appointmentAt) {
                  writeJson(res, 422, { ok: false, message: 'patient_id, patient_name, session_type, counselor, and appointment_at are required.' });
                  return;
                }
                await pool.query(
                  `INSERT INTO mental_health_patients (patient_id, patient_name, patient_type, guardian_contact)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT (patient_id) DO UPDATE SET
                     patient_name = EXCLUDED.patient_name,
                     patient_type = EXCLUDED.patient_type,
                     guardian_contact = COALESCE(EXCLUDED.guardian_contact, mental_health_patients.guardian_contact),
                     updated_at = CURRENT_TIMESTAMP`,
                  [patientId, patientName, inferPatientType({ patientType: body.patient_type, patientName, patientId }), toSafeText(body.guardian_contact) || null]
                );
                const caseReference = `MHS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
                const riskLevel = (toSafeText(body.risk_level) || 'low').toLowerCase();
                const status = toBooleanFlag(body.is_draft) ? 'create' : riskLevel === 'high' ? 'at_risk' : 'active';
                await pool.query(`INSERT INTO mental_health_sessions (case_reference, patient_id, patient_name, patient_type, counselor, session_type, status, risk_level, diagnosis_condition, treatment_plan, session_goals, session_duration_minutes, session_mode, location_room, guardian_contact, emergency_contact, medication_reference, follow_up_frequency, escalation_reason, outcome_result, assessment_score, assessment_tool, appointment_at, next_follow_up_at, created_by_role, is_draft) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [caseReference, patientId, patientName, inferPatientType({ patientType: body.patient_type, patientName, patientId }), counselor, sessionType, status, riskLevel, toSafeText(body.diagnosis_condition) || null, toSafeText(body.treatment_plan) || null, toSafeText(body.session_goals) || null, Math.max(15, toSafeInt(body.session_duration_minutes, 45)), toSafeText(body.session_mode) || 'in_person', toSafeText(body.location_room) || null, toSafeText(body.guardian_contact) || null, toSafeText(body.emergency_contact) || null, toSafeText(body.medication_reference) || null, toSafeText(body.follow_up_frequency) || null, toSafeText(body.escalation_reason) || null, toSafeText(body.outcome_result) || null, body.assessment_score == null ? null : toSafeInt(body.assessment_score, 0), toSafeText(body.assessment_tool) || null, appointmentAt, toSqlDateTime(body.next_follow_up_at), role, toBooleanFlag(body.is_draft) ? 1 : 0]);
                const [rows] = await pool.query<RowDataPacket>(`SELECT id FROM mental_health_sessions WHERE case_reference = ? LIMIT 1`, [caseReference]);
                await saveActivity(Number(rows[0]?.id || 0), 'SESSION_CREATED', `Session ${caseReference} created with status ${status}.`);
                writeJson(res, 200, { ok: true, message: 'Session created.' });
                return;
              }

              const [existingRows] = await pool.query<RowDataPacket>(`SELECT * FROM mental_health_sessions WHERE id = ? LIMIT 1`, [sessionId]);
              const existing = existingRows[0];
              if (!existing) {
                writeJson(res, 404, { ok: false, message: 'Session not found.' });
                return;
              }

              if (action === 'update_session') {
                const nextRisk = (toSafeText(body.risk_level) || toSafeText(existing.risk_level) || 'low').toLowerCase();
                const nextStatus = toSafeText(body.status) || (nextRisk === 'high' && ['create', 'active', 'follow_up'].includes(toSafeText(existing.status)) ? 'at_risk' : toSafeText(existing.status));
                await pool.query(`UPDATE mental_health_sessions SET counselor = COALESCE(?, counselor), session_type = COALESCE(?, session_type), status = COALESCE(?, status), risk_level = COALESCE(?, risk_level), diagnosis_condition = COALESCE(?, diagnosis_condition), treatment_plan = COALESCE(?, treatment_plan), session_goals = COALESCE(?, session_goals), session_duration_minutes = COALESCE(?, session_duration_minutes), session_mode = COALESCE(?, session_mode), location_room = COALESCE(?, location_room), guardian_contact = COALESCE(?, guardian_contact), emergency_contact = COALESCE(?, emergency_contact), medication_reference = COALESCE(?, medication_reference), follow_up_frequency = COALESCE(?, follow_up_frequency), assessment_score = COALESCE(?, assessment_score), assessment_tool = COALESCE(?, assessment_tool), escalation_reason = COALESCE(?, escalation_reason), outcome_result = COALESCE(?, outcome_result), appointment_at = COALESCE(?, appointment_at), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [toSafeText(body.counselor) || null, toSafeText(body.session_type) || null, nextStatus || null, nextRisk || null, toSafeText(body.diagnosis_condition) || null, toSafeText(body.treatment_plan) || null, toSafeText(body.session_goals) || null, toSafeInt(body.session_duration_minutes, 0) || null, toSafeText(body.session_mode) || null, toSafeText(body.location_room) || null, toSafeText(body.guardian_contact) || null, toSafeText(body.emergency_contact) || null, toSafeText(body.medication_reference) || null, toSafeText(body.follow_up_frequency) || null, body.assessment_score == null ? null : toSafeInt(body.assessment_score, 0), toSafeText(body.assessment_tool) || null, toSafeText(body.escalation_reason) || null, toSafeText(body.outcome_result) || null, toSqlDateTime(body.appointment_at), sessionId]);
                await saveActivity(sessionId, 'SESSION_UPDATED', `Session ${existing.case_reference} updated.`);
                writeJson(res, 200, { ok: true, message: 'Session updated.' });
                return;
              }

              if (action === 'record_note') {
                const noteContent = toSafeText(body.note_content);
                if (!noteContent) {
                  writeJson(res, 422, { ok: false, message: 'note_content is required.' });
                  return;
                }
                await pool.query(`INSERT INTO mental_health_notes (session_id, note_type, note_content, clinical_score, attachment_name, attachment_url, created_by_role) VALUES (?, ?, ?, ?, ?, ?, ?)`, [sessionId, toSafeText(body.note_type) || 'Progress', noteContent, body.clinical_score == null ? null : toSafeInt(body.clinical_score, 0), toSafeText(body.attachment_name) || null, toSafeText(body.attachment_url) || null, role]);
                if (toBooleanFlag(body.mark_at_risk)) {
                  await pool.query(`UPDATE mental_health_sessions SET status = 'at_risk', risk_level = 'high', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [sessionId]);
                }
                await saveActivity(sessionId, 'NOTE_RECORDED', `Structured note recorded: ${toSafeText(body.note_type) || 'Progress'}.`);
                writeJson(res, 200, { ok: true, message: 'Note recorded.' });
                return;
              }

              const actionUpdates: Record<string, { sql: string; params: unknown[]; message: string }> = {
                schedule_followup: { sql: `UPDATE mental_health_sessions SET status = CASE WHEN status IN ('completed', 'archived') THEN status ELSE 'follow_up' END, next_follow_up_at = ?, follow_up_frequency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params: [toSqlDateTime(body.next_follow_up_at), toSafeText(body.follow_up_frequency), sessionId], message: 'Follow-up scheduled.' },
                set_at_risk: { sql: `UPDATE mental_health_sessions SET status = 'at_risk', risk_level = 'high', escalation_reason = COALESCE(?, escalation_reason), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params: [toSafeText(body.escalation_reason) || null, sessionId], message: 'Session marked as at risk.' },
                complete_session: { sql: `UPDATE mental_health_sessions SET status = 'completed', outcome_result = ?, is_draft = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params: [toSafeText(body.outcome_result), sessionId], message: 'Session completed.' },
                escalate_session: { sql: `UPDATE mental_health_sessions SET status = 'escalated', risk_level = 'high', escalation_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params: [toSafeText(body.escalation_reason), sessionId], message: 'Session escalated.' },
                archive_session: { sql: `UPDATE mental_health_sessions SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params: [sessionId], message: 'Session archived.' }
              };
              const target = actionUpdates[action];
              if (!target) {
                writeJson(res, 422, { ok: false, message: 'Unsupported mental health action.' });
                return;
              }
              await pool.query(target.sql, target.params);
              await saveActivity(sessionId, action.toUpperCase(), target.message);
              writeJson(res, 200, { ok: true, message: target.message });
              return;
            }
          }

          if (url.pathname === '/api/patients') {
            await ensurePatientMasterTables(pool);
            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const forceSync = toSafeText(url.searchParams.get('sync')) === '1';
              const [countRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM patient_master`);
              if (forceSync || Number(countRows[0]?.total || 0) === 0) {
                await rebuildPatientMaster(pool);
              }
              const search = toSafeText(url.searchParams.get('search'));
              const moduleFilter = toSafeText(url.searchParams.get('module')).toLowerCase() || 'all';
              const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
              const perPage = Math.min(50, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 10)));
              const offset = (page - 1) * perPage;
              const where: string[] = [];
              const params: unknown[] = [];
              if (search) {
                const like = `%${search.toLowerCase()}%`;
                where.push(`(LOWER(patient_name) LIKE ? OR LOWER(COALESCE(patient_code,'')) LIKE ? OR LOWER(COALESCE(contact,'')) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ?)`);
                params.push(like, like, like, like);
              }
              if (moduleFilter === 'appointments') where.push(`appointment_count > 0`);
              if (moduleFilter === 'walkin') where.push(`walkin_count > 0`);
              if (moduleFilter === 'checkup') where.push(`checkup_count > 0`);
              if (moduleFilter === 'mental') where.push(`mental_count > 0`);
              if (moduleFilter === 'pharmacy') where.push(`pharmacy_count > 0`);
              const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
              const [totalRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM patient_master${whereSql}`, params);
              const total = Number(totalRows[0]?.total || 0);
              const [rows] = await pool.query<RowDataPacket>(`SELECT * FROM patient_master${whereSql} ORDER BY COALESCE(last_seen_at, updated_at, created_at) DESC LIMIT ? OFFSET ?`, [...params, perPage, offset]);
              const [analyticsRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total_patients, SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) AS high_risk, SUM(CASE WHEN appointment_count > 0 OR walkin_count > 0 OR checkup_count > 0 OR mental_count > 0 OR pharmacy_count > 0 THEN 1 ELSE 0 END) AS active_profiles, SUM(CASE WHEN COALESCE(last_seen_at, updated_at, created_at) >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 1 ELSE 0 END) AS active_30_days FROM patient_master`);
              writeJson(res, 200, { ok: true, data: { analytics: analyticsRows[0] || { total_patients: 0, high_risk: 0, active_profiles: 0, active_30_days: 0 }, items: rows.map(mapPatientRow), meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } } });
              return;
            }
            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              if (toSafeText(body.action).toLowerCase() !== 'sync') {
                writeJson(res, 422, { ok: false, message: 'Unsupported patients action.' });
                return;
              }
              await insertModuleActivity(pool, 'patients', 'Patient Master Sync Requested', 'Patient profile sync requested from modules.', toSafeText(body.actor) || 'System', 'patient_master', null);
              await rebuildPatientMaster(pool);
              writeJson(res, 200, { ok: true, message: 'Sync completed.' });
              return;
            }
          }

          if (url.pathname === '/api/appointments') {
            await ensurePatientAppointmentsTable(pool);
            await ensureDoctorAvailabilityTables(pool);
            await ensureCashierIntegrationTables(pool);
            await backfillAppointmentCashierEvents(pool, options, 100);
            if ((req.method || 'GET').toUpperCase() === 'GET') {
              const search = toSafeText(url.searchParams.get('search'));
              const status = toSafeText(url.searchParams.get('status'));
              const service = toSafeText(url.searchParams.get('service'));
              const doctor = normalizeDoctorFilter(toSafeText(url.searchParams.get('doctor')));
              const period = toSafeText(url.searchParams.get('period')).toLowerCase();
              const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
              const perPage = Math.min(50, Math.max(1, Number(url.searchParams.get('per_page') || '10')));
              const offset = (page - 1) * perPage;

              const where: string[] = [];
              const params: unknown[] = [];
              if (search) {
                const pattern = `%${search.toLowerCase()}%`;
                where.push(`(LOWER(a.patient_name) LIKE ? OR LOWER(COALESCE(a.patient_email, '')) LIKE ? OR LOWER(a.phone_number) LIKE ? OR LOWER(a.booking_id) LIKE ? OR LOWER(COALESCE(a.patient_id, '')) LIKE ? OR LOWER(COALESCE(a.symptoms_summary, '')) LIKE ?)`);
                params.push(pattern, pattern, pattern, pattern, pattern, pattern);
              }
              if (status && status.toLowerCase() !== 'all statuses') {
                where.push('LOWER(a.status) = ?');
                params.push(status.toLowerCase());
              }
              if (service && service.toLowerCase() !== 'all services') {
                where.push('(LOWER(COALESCE(a.visit_type, a.department_name, \'\')) = ? OR LOWER(a.department_name) = ?)');
                params.push(service.toLowerCase(), service.toLowerCase());
              }
              if (doctor && doctor.toLowerCase() !== 'any') {
                where.push('LOWER(a.doctor_name) = ?');
                params.push(doctor.toLowerCase());
              }
              const periodRange = matchesDateRange(period);
              if (periodRange) {
                where.push(
                  periodRange.sql
                    .replace(/appointment_date/g, 'a.appointment_date')
                    .replace(/\bstatus\b/g, 'a.status')
                );
                params.push(...periodRange.params);
              }

              const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
              const [countRows] = await pool.query<RowDataPacket>(`SELECT COUNT(*) AS total FROM patient_appointments a${whereSql}`, params);
              const total = Number(countRows[0]?.total || 0);
              const [rows] = await pool.query<RowDataPacket>(
                `SELECT a.id, a.booking_id, a.patient_id, a.patient_name, a.patient_email, a.patient_type, a.phone_number, a.emergency_contact, a.insurance_provider,
                        a.payment_method, a.actor_role, a.appointment_priority, a.doctor_name,
                        COALESCE(NULLIF(a.visit_type, ''), a.department_name, 'General Check-Up') AS service_name,
                        a.department_name, a.appointment_date, a.preferred_time, a.status, a.symptoms_summary, a.doctor_notes, a.visit_reason, a.created_at, a.updated_at,
                        p.cashier_billing_id, p.cashier_reference, p.official_receipt, COALESCE(p.amount_due, e.amount_due, 0) AS amount_due, p.amount_paid, p.balance_due, p.paid_at,
                        p.cashier_reference AS cashier_billing_no,
                        COALESCE(NULLIF(p.payment_status, ''), 'unpaid') AS cashier_payment_status,
                        p.latest_payment_method AS cashier_payment_method,
                        a.cashier_can_proceed, a.cashier_verified_at,
                        COALESCE(e.sync_status, '') AS cashier_sync_status
                 FROM patient_appointments a
                 LEFT JOIN cashier_payment_links p
                   ON p.source_module = 'appointments'
                  AND p.source_key = a.booking_id
                 LEFT JOIN (
                   SELECT e1.source_key, e1.sync_status, e1.amount_due, e1.id
                   FROM cashier_integration_events e1
                   INNER JOIN (
                     SELECT source_key, MAX(id) AS max_id
                     FROM cashier_integration_events
                     WHERE source_module = 'appointments'
                     GROUP BY source_key
                   ) latest_event ON latest_event.max_id = e1.id
                 ) e
                   ON e.source_key = a.booking_id${whereSql}
                 ORDER BY a.appointment_date ASC, a.preferred_time ASC
                 LIMIT ? OFFSET ?`,
                [...params, perPage, offset]
              );
              const [analyticsRows] = await pool.query<RowDataPacket>(
                `SELECT COUNT(DISTINCT COALESCE(NULLIF(TRIM(patient_email), ''), NULLIF(TRIM(phone_number), ''), patient_name)) AS totalPatients,
                        COUNT(*) AS totalAppointments,
                        SUM(CASE WHEN appointment_date = ? THEN 1 ELSE 0 END) AS todayAppointments,
                        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('new', 'pending', 'awaiting') THEN 1 ELSE 0 END) AS pendingQueue
                 FROM patient_appointments`,
                [currentDateString()]
              );
              writeJson(res, 200, {
                ok: true,
                data: {
                  analytics: {
                    totalPatients: Number(analyticsRows[0]?.totalPatients || 0),
                    totalAppointments: Number(analyticsRows[0]?.totalAppointments || 0),
                    todayAppointments: Number(analyticsRows[0]?.todayAppointments || 0),
                    pendingQueue: Number(analyticsRows[0]?.pendingQueue || 0)
                  },
                  items: rows.map(mapAppointmentRow),
                  meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) }
                }
              });
              return;
            }

            if ((req.method || '').toUpperCase() === 'POST') {
              const body = await readJsonBody(req);
              const action = toSafeText(body.action || 'update').toLowerCase();

              if (action === 'create') {
                const patientName = toSafeText(body.patient_name);
                const phoneNumber = toSafeText(body.phone_number);
                const doctorName = toSafeText(body.doctor_name);
                const departmentName = toSafeText(body.department_name);
                const visitType = toSafeText(body.visit_type);
                const appointmentDate = toSqlDate(body.appointment_date);
                const preferredTime = toSafeText(body.preferred_time);
                const requestedStatus = toSafeText(body.status || 'Pending') || 'Pending';
                const priority = toSafeText(body.appointment_priority || 'Routine') || 'Routine';
                const patientId = toSafeText(body.patient_id);
                const patientAge = Number(body.patient_age ?? 0);
                const amountDue = toSafeMoney(body.amount_due, 0);

                if (!patientName || !phoneNumber || !doctorName || !departmentName || !visitType || !appointmentDate) {
                  writeJson(res, 422, { ok: false, message: 'Missing required create fields.' });
                  return;
                }

                const availability = await getDoctorAvailabilitySnapshot(pool, doctorName, departmentName, appointmentDate, preferredTime || undefined);
                if (!Boolean(availability.isDoctorAvailable)) {
                  writeJson(res, 422, { ok: false, message: String(availability.reason || 'Doctor unavailable.') });
                  return;
                }

                const now = new Date();
                const bookingId = `APT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
                const actorRole = ['student', 'teacher', 'admin'].includes(toSafeText(body.actor_role).toLowerCase())
                  ? toSafeText(body.actor_role).toLowerCase()
                  : 'unknown';
                const patientType = inferPatientType({
                  patientType: body.patient_type,
                  actorRole,
                  patientName,
                  patientEmail: body.patient_email,
                  concern: body.visit_reason,
                  visitType,
                  patientId,
                  age: body.patient_age
                });
                const requiresCashierVerification = amountDue > 0;
                const status = requiresCashierVerification && requestedStatus.toLowerCase() !== 'canceled'
                  ? 'Awaiting'
                  : requestedStatus;

                await pool.query(
                  `INSERT INTO patient_appointments (
                    booking_id, patient_id, patient_name, patient_age, patient_email, patient_gender, patient_type, guardian_name,
                    phone_number, emergency_contact, insurance_provider, payment_method, actor_role, appointment_priority,
                    symptoms_summary, doctor_notes, doctor_name, department_name, visit_type, appointment_date, preferred_time, visit_reason, status
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    bookingId,
                    patientId || null,
                    patientName,
                    body.patient_age ?? null,
                    toSafeText(body.patient_email) || null,
                    toSafeText(body.patient_sex || body.patient_gender) || null,
                    patientType,
                    toSafeText(body.guardian_name) || null,
                    phoneNumber,
                    toSafeText(body.emergency_contact) || null,
                    toSafeText(body.insurance_provider) || null,
                    toSafeText(body.payment_method) || null,
                    actorRole,
                    priority,
                    toSafeText(body.symptoms_summary) || null,
                    toSafeText(body.doctor_notes) || null,
                    doctorName,
                    departmentName,
                    visitType,
                    appointmentDate,
                    preferredTime || null,
                    toSafeText(body.visit_reason) || null,
                    status
                  ]
                );

                const [rows] = await pool.query<RowDataPacket>(
                  `SELECT a.id, a.booking_id, a.patient_id, a.patient_name, a.patient_email, a.patient_type, a.phone_number, a.emergency_contact, a.insurance_provider,
                          a.payment_method, a.actor_role, a.appointment_priority, a.doctor_name,
                          COALESCE(NULLIF(a.visit_type, ''), a.department_name, 'General Check-Up') AS service_name,
                          a.department_name, a.appointment_date, a.preferred_time, a.status, a.symptoms_summary, a.doctor_notes, a.visit_reason, a.created_at, a.updated_at,
                          p.cashier_billing_id, p.cashier_reference, p.official_receipt, COALESCE(p.amount_due, e.amount_due, 0) AS amount_due, p.amount_paid, p.balance_due, p.paid_at,
                          p.cashier_reference AS cashier_billing_no,
                          COALESCE(NULLIF(p.payment_status, ''), 'unpaid') AS cashier_payment_status,
                          p.latest_payment_method AS cashier_payment_method,
                          a.cashier_can_proceed, a.cashier_verified_at,
                          COALESCE(e.sync_status, '') AS cashier_sync_status
                   FROM patient_appointments a
                   LEFT JOIN cashier_payment_links p
                     ON p.source_module = 'appointments'
                    AND p.source_key = a.booking_id
                   LEFT JOIN (
                     SELECT e1.source_key, e1.sync_status, e1.amount_due, e1.id
                     FROM cashier_integration_events e1
                     INNER JOIN (
                       SELECT source_key, MAX(id) AS max_id
                       FROM cashier_integration_events
                       WHERE source_module = 'appointments'
                       GROUP BY source_key
                     ) latest_event ON latest_event.max_id = e1.id
                   ) e
                     ON e.source_key = a.booking_id
                   WHERE a.booking_id = ? LIMIT 1`,
                  [bookingId]
                );

                await insertModuleActivity(
                  pool,
                  'appointments',
                  'Appointment Created',
                  `Created appointment ${bookingId} for ${patientName} with ${doctorName}.`,
                  toSafeText(body.actor) || 'System',
                  'appointment',
                  bookingId,
                  { doctorName, departmentName, appointmentDate, preferredTime: preferredTime || null, status, patientAge }
                );
                await queueCashierIntegrationEvent(pool, {
                  sourceModule: 'appointments',
                  sourceEntity: 'appointment',
                  sourceKey: bookingId,
                  patientName,
                  patientType,
                  referenceNo: bookingId,
                  amountDue: toSafeMoney(body.amount_due, 0),
                  paymentStatus: normalizePaymentStatus(body.payment_status),
                  payload: {
                    bookingId,
                    student_id: patientId || null,
                    patient_id: patientId || null,
                    student_name: patientName,
                    patient_email: toSafeText(body.patient_email) || null,
                    phone_number: phoneNumber,
                    year_level: toSafeText(body.year_level) || null,
                    due_date: appointmentDate,
                    created_by: toSafeText(body.actor) || 'Clinic System',
                    fee_type: visitType,
                    description: visitType,
                    doctorName,
                    departmentName,
                    department_name: departmentName,
                    visitType,
                    program: departmentName,
                    appointmentDate,
                    preferredTime: preferredTime || null,
                    paymentMethod: toSafeText(body.payment_method) || null
                  }
                });

                if (cashierIntegrationEnabled(options) && cashierSyncMode(options) === 'auto') {
                  const [eventRows] = await pool.query<RowDataPacket>(
                    `SELECT *
                     FROM cashier_integration_events
                     WHERE source_module = 'appointments' AND source_key = ?
                     ORDER BY created_at DESC
                     LIMIT 1`,
                    [bookingId]
                  );
                  if (eventRows[0]) {
                    await dispatchCashierEvent(pool, options, eventRows[0]);
                    await syncAppointmentCashierColumnsFromLinks(pool, bookingId);
                  }
                }

                const [syncedRows] = await pool.query<RowDataPacket>(
                  `SELECT a.id, a.booking_id, a.patient_id, a.patient_name, a.patient_email, a.patient_type, a.phone_number, a.emergency_contact, a.insurance_provider,
                          a.payment_method, a.actor_role, a.appointment_priority, a.doctor_name,
                          COALESCE(NULLIF(a.visit_type, ''), a.department_name, 'General Check-Up') AS service_name,
                          a.department_name, a.appointment_date, a.preferred_time, a.status, a.symptoms_summary, a.doctor_notes, a.visit_reason, a.created_at, a.updated_at,
                          p.cashier_billing_id, p.cashier_reference, p.official_receipt, COALESCE(p.amount_due, e.amount_due, 0) AS amount_due, p.amount_paid, p.balance_due, p.paid_at,
                          COALESCE(NULLIF(a.cashier_billing_no, ''), p.cashier_reference) AS cashier_billing_no,
                          COALESCE(NULLIF(a.cashier_payment_status, ''), NULLIF(p.payment_status, ''), 'unpaid') AS cashier_payment_status,
                          p.latest_payment_method AS cashier_payment_method,
                          a.cashier_can_proceed, a.cashier_verified_at,
                          COALESCE(e.sync_status, '') AS cashier_sync_status
                   FROM patient_appointments a
                   LEFT JOIN cashier_payment_links p
                     ON p.source_module = 'appointments'
                    AND p.source_key = a.booking_id
                   LEFT JOIN (
                     SELECT e1.source_key, e1.sync_status, e1.amount_due, e1.id
                     FROM cashier_integration_events e1
                     INNER JOIN (
                       SELECT source_key, MAX(id) AS max_id
                       FROM cashier_integration_events
                       WHERE source_module = 'appointments'
                       GROUP BY source_key
                     ) latest_event ON latest_event.max_id = e1.id
                   ) e
                     ON e.source_key = a.booking_id
                   WHERE a.booking_id = ? LIMIT 1`,
                  [bookingId]
                );

                writeJson(res, 200, { ok: true, message: 'Appointment created.', data: syncedRows[0] ? mapAppointmentRow(syncedRows[0]) : null });
                return;
              }

              const bookingId = toSafeText(body.booking_id);
              if (!bookingId) {
                writeJson(res, 422, { ok: false, message: 'booking_id is required.' });
                return;
              }

              const [existingRows] = await pool.query<RowDataPacket>(
                `SELECT a.booking_id, a.doctor_name, a.department_name, a.appointment_date, a.preferred_time, a.status,
                        p.cashier_billing_id, p.cashier_reference, p.amount_due,
                        COALESCE(NULLIF(p.payment_status, ''), 'unpaid') AS cashier_payment_status
                 FROM patient_appointments a
                 LEFT JOIN cashier_payment_links p
                   ON p.source_module = 'appointments'
                  AND p.source_key = a.booking_id
                 WHERE a.booking_id = ? LIMIT 1`,
                [bookingId]
              );
              const existing = existingRows[0];
              if (!existing) {
                writeJson(res, 404, { ok: false, message: 'Appointment not found.' });
                return;
              }

              const nextDoctorName = 'doctor_name' in body ? toSafeText(body.doctor_name) : String(existing.doctor_name || '');
              const nextDepartmentName = 'department_name' in body ? toSafeText(body.department_name) : String(existing.department_name || '');
              const nextAppointmentDate = 'appointment_date' in body ? toSqlDate(body.appointment_date) : toSqlDate(existing.appointment_date);
              const nextPreferredTime = 'preferred_time' in body ? toSafeText(body.preferred_time) : String(existing.preferred_time || '');
              const nextStatus = 'status' in body ? toSafeText(body.status).toLowerCase() : '';
              const requiresCashierVerification = appointmentRequiresCashierVerification({
                cashierBillingId: existing.cashier_billing_id,
                cashierReference: existing.cashier_reference,
                amountDue: existing.amount_due
              });
              const canProceedByCashier = appointmentCanProceedByCashier({
                cashierBillingId: existing.cashier_billing_id,
                cashierReference: existing.cashier_reference,
                amountDue: existing.amount_due,
                cashierPaymentStatus: existing.cashier_payment_status
              });
              if (requiresCashierVerification && !canProceedByCashier && ['confirmed', 'accepted', 'appointed'].includes(nextStatus)) {
                writeJson(res, 422, {
                  ok: false,
                  message: 'This appointment is still waiting for cashier payment verification. Keep it on Awaiting until payment is verified as paid.'
                });
                return;
              }
              if (nextStatus !== 'canceled' && nextAppointmentDate) {
                const availability = await getDoctorAvailabilitySnapshot(pool, nextDoctorName, nextDepartmentName, nextAppointmentDate, nextPreferredTime || undefined, bookingId);
                if (!Boolean(availability.isDoctorAvailable)) {
                  writeJson(res, 422, { ok: false, message: String(availability.reason || 'Doctor unavailable.') });
                  return;
                }
              }

              const fieldMap: Array<[string, string, unknown]> = [
                ['status', 'status', body.status],
                ['patient_id', 'patient_id', body.patient_id],
                ['patient_gender', 'patient_gender', body.patient_gender ?? body.patient_sex],
                ['patient_type', 'patient_type', inferPatientType({
                  patientType: body.patient_type,
                  actorRole: body.actor_role,
                  patientName: body.patient_name,
                  patientEmail: body.patient_email,
                  concern: body.visit_reason,
                  visitType: body.visit_type,
                  patientId: body.patient_id,
                  age: body.patient_age
                })],
                ['guardian_name', 'guardian_name', body.guardian_name],
                ['emergency_contact', 'emergency_contact', body.emergency_contact],
                ['insurance_provider', 'insurance_provider', body.insurance_provider],
                ['payment_method', 'payment_method', body.payment_method],
                ['actor_role', 'actor_role', body.actor_role],
                ['appointment_priority', 'appointment_priority', body.appointment_priority],
                ['symptoms_summary', 'symptoms_summary', body.symptoms_summary],
                ['doctor_notes', 'doctor_notes', body.doctor_notes],
                ['doctor_name', 'doctor_name', body.doctor_name],
                ['department_name', 'department_name', body.department_name],
                ['visit_type', 'visit_type', body.visit_type],
                ['appointment_date', 'appointment_date', toSqlDate(body.appointment_date)],
                ['preferred_time', 'preferred_time', body.preferred_time],
                ['visit_reason', 'visit_reason', body.visit_reason]
              ];

              const setParts: string[] = [];
              const values: unknown[] = [];
              fieldMap.forEach(([inputKey, column, value]) => {
                if (!(inputKey in body)) return;
                setParts.push(`${column} = ?`);
                values.push(typeof value === 'string' && value.trim() === '' ? null : value);
              });
              if (!setParts.length) {
                writeJson(res, 422, { ok: false, message: 'No fields to update.' });
                return;
              }

              values.push(bookingId);
              await pool.query(`UPDATE patient_appointments SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?`, values);

              const [rows] = await pool.query<RowDataPacket>(
                `SELECT a.id, a.booking_id, a.patient_id, a.patient_name, a.patient_email, a.patient_type, a.phone_number, a.emergency_contact, a.insurance_provider,
                        a.payment_method, a.actor_role, a.appointment_priority, a.doctor_name,
                        COALESCE(NULLIF(a.visit_type, ''), a.department_name, 'General Check-Up') AS service_name,
                        a.department_name, a.appointment_date, a.preferred_time, a.status, a.symptoms_summary, a.doctor_notes, a.visit_reason, a.created_at, a.updated_at,
                        p.cashier_billing_id, p.cashier_reference, p.official_receipt, COALESCE(p.amount_due, e.amount_due, 0) AS amount_due, p.amount_paid, p.balance_due, p.paid_at,
                        p.cashier_reference AS cashier_billing_no,
                        COALESCE(NULLIF(p.payment_status, ''), 'unpaid') AS cashier_payment_status,
                        p.latest_payment_method AS cashier_payment_method,
                        COALESCE(e.sync_status, '') AS cashier_sync_status
                 FROM patient_appointments a
                 LEFT JOIN cashier_payment_links p
                   ON p.source_module = 'appointments'
                  AND p.source_key = a.booking_id
                 LEFT JOIN (
                   SELECT e1.source_key, e1.sync_status, e1.amount_due, e1.id
                   FROM cashier_integration_events e1
                   INNER JOIN (
                     SELECT source_key, MAX(id) AS max_id
                     FROM cashier_integration_events
                     WHERE source_module = 'appointments'
                     GROUP BY source_key
                   ) latest_event ON latest_event.max_id = e1.id
                 ) e
                   ON e.source_key = a.booking_id
                 WHERE a.booking_id = ? LIMIT 1`,
                [bookingId]
              );

              await insertModuleActivity(
                pool,
                'appointments',
                'Appointment Updated',
                `Updated appointment ${bookingId}.`,
                toSafeText(body.actor) || 'System',
                'appointment',
                bookingId,
                { doctorName: nextDoctorName || null, departmentName: nextDepartmentName || null, appointmentDate: nextAppointmentDate || null, preferredTime: nextPreferredTime || null }
              );
              const nextAmountDue = 'amount_due' in body ? toSafeMoney(body.amount_due, 0) : toSafeMoney(existing.amount_due, 0);
              await queueCashierIntegrationEvent(pool, {
                sourceModule: 'appointments',
                sourceEntity: 'appointment',
                sourceKey: bookingId,
                patientName: toSafeText(body.patient_name) || toSafeText(rows[0]?.patient_name),
                patientType: toSafeText(rows[0]?.patient_type),
                referenceNo: bookingId,
                amountDue: nextAmountDue,
                paymentStatus: normalizePaymentStatus(body.payment_status),
                payload: {
                  bookingId,
                  student_id: toSafeText(rows[0]?.patient_id) || null,
                  patient_id: toSafeText(rows[0]?.patient_id) || null,
                  student_name: toSafeText(rows[0]?.patient_name) || null,
                  patient_email: toSafeText(rows[0]?.patient_email) || null,
                  phone_number: toSafeText(rows[0]?.phone_number) || null,
                  year_level: toSafeText(body.year_level) || null,
                  due_date: nextAppointmentDate || null,
                  created_by: toSafeText(body.actor) || 'Clinic System',
                  fee_type: toSafeText(rows[0]?.service_name) || null,
                  description: toSafeText(rows[0]?.service_name) || null,
                  doctorName: nextDoctorName || null,
                  departmentName: nextDepartmentName || null,
                  department_name: nextDepartmentName || null,
                  program: nextDepartmentName || null,
                  appointmentDate: nextAppointmentDate || null,
                  preferredTime: nextPreferredTime || null,
                  status: toSafeText(rows[0]?.status) || null,
                  paymentMethod: toSafeText(rows[0]?.payment_method) || null
                }
              });

              if (cashierIntegrationEnabled(options) && cashierSyncMode(options) === 'auto') {
                const [eventRows] = await pool.query<RowDataPacket>(
                  `SELECT *
                   FROM cashier_integration_events
                   WHERE source_module = 'appointments' AND source_key = ?
                   ORDER BY created_at DESC
                   LIMIT 1`,
                  [bookingId]
                );
                if (eventRows[0]) {
                  await dispatchCashierEvent(pool, options, eventRows[0]);
                  await syncAppointmentCashierColumnsFromLinks(pool, bookingId);
                }
              }

              const [syncedRows] = await pool.query<RowDataPacket>(
                `SELECT a.id, a.booking_id, a.patient_id, a.patient_name, a.patient_email, a.patient_type, a.phone_number, a.emergency_contact, a.insurance_provider,
                        a.payment_method, a.actor_role, a.appointment_priority, a.doctor_name,
                        COALESCE(NULLIF(a.visit_type, ''), a.department_name, 'General Check-Up') AS service_name,
                        a.department_name, a.appointment_date, a.preferred_time, a.status, a.symptoms_summary, a.doctor_notes, a.visit_reason, a.created_at, a.updated_at,
                        p.cashier_billing_id, p.cashier_reference, p.official_receipt, COALESCE(p.amount_due, e.amount_due, 0) AS amount_due, p.amount_paid, p.balance_due, p.paid_at,
                        COALESCE(NULLIF(a.cashier_billing_no, ''), p.cashier_reference) AS cashier_billing_no,
                        COALESCE(NULLIF(a.cashier_payment_status, ''), NULLIF(p.payment_status, ''), 'unpaid') AS cashier_payment_status,
                        p.latest_payment_method AS cashier_payment_method,
                        a.cashier_can_proceed, a.cashier_verified_at,
                        COALESCE(e.sync_status, '') AS cashier_sync_status
                 FROM patient_appointments a
                 LEFT JOIN cashier_payment_links p
                   ON p.source_module = 'appointments'
                  AND p.source_key = a.booking_id
                 LEFT JOIN (
                   SELECT e1.source_key, e1.sync_status, e1.amount_due, e1.id
                   FROM cashier_integration_events e1
                   INNER JOIN (
                     SELECT source_key, MAX(id) AS max_id
                     FROM cashier_integration_events
                     WHERE source_module = 'appointments'
                     GROUP BY source_key
                   ) latest_event ON latest_event.max_id = e1.id
                 ) e
                   ON e.source_key = a.booking_id
                 WHERE a.booking_id = ? LIMIT 1`,
                [bookingId]
              );

              writeJson(res, 200, { ok: true, message: 'Appointment updated.', data: syncedRows[0] ? mapAppointmentRow(syncedRows[0]) : null });
              return;
            }
          }

          // ── Clinic Health Reports ──────────────────────────────────────────────────
          if (url.pathname === '/api/health-reports') {
            await ensureHealthReportsTable(pool);
            await ensureModuleActivityLogsTable(pool);
            const method = (req.method || 'GET').toUpperCase();

            if (method === 'GET') {
              const search = toSafeText(url.searchParams.get('search'));
              const sentToPmed = toSafeText(url.searchParams.get('sent_to_pmed'));
              const severity = toSafeText(url.searchParams.get('severity'));
              const page = Math.max(1, toSafeInt(url.searchParams.get('page'), 1));
              const perPage = Math.min(50, Math.max(1, toSafeInt(url.searchParams.get('per_page'), 20)));
              const offset = (page - 1) * perPage;
              const where: string[] = [];
              const params: unknown[] = [];

              if (search) {
                where.push(`(LOWER(student_name) LIKE ? OR LOWER(COALESCE(student_id,'')) LIKE ? OR LOWER(health_issue) LIKE ?)`);
                const q = `%${search.toLowerCase()}%`;
                params.push(q, q, q);
              }
              if (sentToPmed === '1' || sentToPmed === 'true') {
                where.push(`sent_to_pmed = 1`);
              } else if (sentToPmed === '0' || sentToPmed === 'false') {
                where.push(`sent_to_pmed = 0`);
              }
              if (severity) {
                where.push(`severity = ?`);
                params.push(severity.toLowerCase());
              }

              const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
              const [countRows] = await pool.query<RowDataPacket>(
                `SELECT COUNT(*) AS total FROM clinic_health_reports ${whereClause}`,
                params
              );
              const total = Number(countRows[0]?.total ?? 0);
              const totalPages = Math.max(1, Math.ceil(total / perPage));

              const [rows] = await pool.query<RowDataPacket>(
                `SELECT id, report_code, student_id, student_name, student_type, grade_section, age, sex,
                        health_issue, symptoms, severity, treatment_given, medicines_used, first_aid_given,
                        attending_staff, remarks, sent_to_pmed, pmed_sent_at, pmed_entity_key, created_at, updated_at
                 FROM clinic_health_reports
                 ${whereClause}
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, perPage, offset]
              );

              writeJson(res, 200, {
                ok: true,
                data: {
                  items: rows.map((r) => ({
                    id: Number(r.id),
                    reportCode: String(r.report_code || ''),
                    studentId: String(r.student_id || ''),
                    studentName: String(r.student_name || ''),
                    studentType: String(r.student_type || 'student'),
                    gradeSection: String(r.grade_section || ''),
                    age: r.age !== null ? Number(r.age) : null,
                    sex: String(r.sex || ''),
                    healthIssue: String(r.health_issue || ''),
                    symptoms: String(r.symptoms || ''),
                    severity: String(r.severity || 'low'),
                    treatmentGiven: String(r.treatment_given || ''),
                    medicinesUsed: Array.isArray(r.medicines_used) ? r.medicines_used : [],
                    firstAidGiven: String(r.first_aid_given || ''),
                    attendingStaff: String(r.attending_staff || ''),
                    remarks: String(r.remarks || ''),
                    sentToPmed: Number(r.sent_to_pmed) === 1,
                    pmedSentAt: r.pmed_sent_at ? formatDateTimeCell(r.pmed_sent_at) : null,
                    pmedEntityKey: String(r.pmed_entity_key || ''),
                    createdAt: formatDateTimeCell(r.created_at),
                    updatedAt: formatDateTimeCell(r.updated_at)
                  })),
                  meta: { page, perPage, total, totalPages }
                }
              });
              return;
            }

            if (method === 'POST') {
              const body = await readJsonBody(req);
              const action = toSafeText(body.action).toLowerCase() || 'create';

              if (action === 'create' || action === 'send_to_pmed') {
                const studentName = toSafeText(body.student_name);
                if (!studentName) {
                  writeJson(res, 422, { ok: false, message: 'student_name is required.' });
                  return;
                }
                const healthIssue = toSafeText(body.health_issue);
                if (!healthIssue) {
                  writeJson(res, 422, { ok: false, message: 'health_issue is required.' });
                  return;
                }

                const ts = Date.now();
                const reportCode = `HR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(ts).slice(-6)}`;
                const medicinesUsed = Array.isArray(body.medicines_used) ? body.medicines_used : [];
                const severity = ['low', 'moderate', 'high', 'emergency'].includes(toSafeText(body.severity).toLowerCase())
                  ? toSafeText(body.severity).toLowerCase()
                  : 'low';
                const studentType = ['student', 'teacher'].includes(toSafeText(body.student_type).toLowerCase())
                  ? toSafeText(body.student_type).toLowerCase()
                  : 'student';

                await pool.query(
                  `INSERT INTO clinic_health_reports
                     (report_code, student_id, student_name, student_type, grade_section, age, sex,
                      health_issue, symptoms, severity, treatment_given, medicines_used, first_aid_given,
                      attending_staff, remarks)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?)`,
                  [
                    reportCode,
                    toSafeText(body.student_id) || null,
                    studentName,
                    studentType,
                    toSafeText(body.grade_section) || null,
                    body.age !== undefined && body.age !== null && body.age !== '' ? toSafeInt(body.age, 0) : null,
                    toSafeText(body.sex) || null,
                    healthIssue,
                    toSafeText(body.symptoms) || null,
                    severity,
                    toSafeText(body.treatment_given) || null,
                    JSON.stringify(medicinesUsed),
                    toSafeText(body.first_aid_given) || null,
                    toSafeText(body.attending_staff) || '',
                    toSafeText(body.remarks) || null
                  ]
                );

                const [newRows] = await pool.query<RowDataPacket>(
                  `SELECT * FROM clinic_health_reports WHERE report_code = ? LIMIT 1`,
                  [reportCode]
                );
                const newReport = newRows[0];

                // Always push to PMED activity log so PMED can see it
                const entityKey = `health-report:${reportCode}`;
                const actor = toSafeText(body.actor) || toSafeText(body.attending_staff) || 'Clinic Staff';
                const medicineList = medicinesUsed.map((m: unknown) => {
                  if (typeof m === 'string') return m;
                  const rec = m as Record<string, unknown>;
                  return [rec.name, rec.dose, rec.quantity].filter(Boolean).join(' ');
                }).filter(Boolean).join(', ') || 'None';

                const detail = `[${severity.toUpperCase()}] ${studentName}${toSafeText(body.student_id) ? ` (${toSafeText(body.student_id)})` : ''}: ${healthIssue}`;

                await insertModuleActivity(pool, 'pmed', 'CLINIC_HEALTH_REPORT_RECEIVED',
                  `Clinic health report received from ${actor}. ${detail}`,
                  actor, 'health_report', entityKey, {
                    source_department: 'clinic',
                    source_department_name: 'Clinic',
                    target_department: 'pmed',
                    report_type: 'clinic_health_report',
                    report_code: reportCode,
                    student_id: toSafeText(body.student_id) || null,
                    student_name: studentName,
                    student_type: studentType,
                    grade_section: toSafeText(body.grade_section) || null,
                    age: body.age !== undefined ? body.age : null,
                    sex: toSafeText(body.sex) || null,
                    health_issue: healthIssue,
                    symptoms: toSafeText(body.symptoms) || null,
                    severity,
                    treatment_given: toSafeText(body.treatment_given) || null,
                    medicines_used: medicinesUsed,
                    medicine_list_summary: medicineList,
                    first_aid_given: toSafeText(body.first_aid_given) || null,
                    attending_staff: actor,
                    delivery_status: 'Received',
                    dispatched_at: new Date().toISOString()
                  }
                );

                await insertModuleActivity(pool, 'department_reports', 'Health Report Sent to PMED',
                  detail, actor, 'health_report', entityKey, {
                    source_department: 'clinic',
                    target_key: 'pmed',
                    report_type: 'clinic_health_report',
                    report_code: reportCode,
                    severity,
                    medicine_list_summary: medicineList,
                    delivery_status: 'Received',
                    dispatched_at: new Date().toISOString()
                  }
                );

                // Mark as sent to PMED
                await pool.query(
                  `UPDATE clinic_health_reports SET sent_to_pmed = 1, pmed_sent_at = NOW(), pmed_entity_key = ?, updated_at = NOW() WHERE report_code = ?`,
                  [entityKey, reportCode]
                );

                writeJson(res, 200, {
                  ok: true,
                  message: 'Health report created and sent to PMED.',
                  data: {
                    reportCode,
                    entityKey,
                    studentName,
                    severity,
                    sentToPmed: true,
                    createdAt: newReport ? formatDateTimeCell(newReport.created_at) : new Date().toISOString()
                  }
                });
                return;
              }

              writeJson(res, 422, { ok: false, message: 'Unsupported action for health-reports.' });
              return;
            }

            writeJson(res, 405, { ok: false, message: 'Method not allowed.' });
            return;
          }
          // ── End Clinic Health Reports ──────────────────────────────────────────────

          next();
        } catch (error) {
          writeJson(res, 500, { ok: false, message: error instanceof Error ? error.message : 'Supabase API route failed.' });
        }
      });
    }
  };
}

export function createSupabaseApiMiddleware(options: SupabaseApiOptions): (req: any, res: any, next: () => void) => void {
  let handler: (req: any, res: any, next: () => void) => void = (_req, _res, next) => next();
  const plugin = supabaseApiPlugin(options);
  const configureServer = plugin.configureServer as unknown;
  const register =
    typeof configureServer === 'function'
      ? (configureServer as (server: unknown) => unknown)
      : configureServer &&
          typeof configureServer === 'object' &&
          'handler' in (configureServer as Record<string, unknown>) &&
          typeof (configureServer as { handler?: unknown }).handler === 'function'
        ? ((configureServer as { handler: (server: unknown) => unknown }).handler)
        : undefined;
  if (!register) {
    throw new Error('supabaseApiPlugin.configureServer is not callable. Unexpected Vite plugin shape.');
  }
  try {
    register({
      middlewares: {
        use(fn: (req: any, res: any, next: () => void) => void) {
          handler = fn;
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialise Supabase API middleware: ${message}`);
  }
  return handler;
}
