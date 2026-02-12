import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { neon } from '@neondatabase/serverless';
import vuetify from 'vite-plugin-vuetify';

function normalizePathPrefix(value: string): string {
  if (!value) {
    return '';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

type JsonRecord = Record<string, unknown>;

function writeJson(res: any, statusCode: number, payload: JsonRecord): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: any): Promise<JsonRecord> {
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

function normalizeDoctorFilter(value: string): string {
  return value.replace(/^doctor:\s*/i, '').trim();
}

function neonAppointmentsApiPlugin(databaseUrl?: string): Plugin {
  return {
    name: 'neon-appointments-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '', 'http://localhost');
        if (url.pathname !== '/api/appointments' && url.pathname !== '/api/registrations' && url.pathname !== '/api/walk-ins') {
          next();
          return;
        }

        if (!databaseUrl) {
          writeJson(res, 500, { ok: false, message: 'DATABASE_URL is missing in admin_template/.env' });
          return;
        }

        const sql = neon(databaseUrl);

        try {
          if (url.pathname === '/api/registrations' && (req.method || 'GET').toUpperCase() === 'GET') {
            await sql.query(`
              CREATE TABLE IF NOT EXISTS patient_registrations (
                id BIGSERIAL PRIMARY KEY,
                case_id VARCHAR(40) NOT NULL UNIQUE,
                patient_name VARCHAR(150) NOT NULL,
                patient_email VARCHAR(190) NULL,
                age SMALLINT NULL,
                concern TEXT NULL,
                intake_time TIMESTAMP NOT NULL DEFAULT NOW(),
                booked_time TIMESTAMP NOT NULL DEFAULT NOW(),
                status VARCHAR(20) NOT NULL DEFAULT 'Pending',
                assigned_to VARCHAR(120) NOT NULL DEFAULT 'Unassigned',
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
              )
            `);

            const search = (url.searchParams.get('search') || '').trim();
            const status = (url.searchParams.get('status') || '').trim();
            const sort = (url.searchParams.get('sort') || 'Sort Latest Intake').trim();
            const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
            const perPage = Math.min(50, Math.max(1, Number(url.searchParams.get('per_page') || '10')));
            const offset = (page - 1) * perPage;

            const where: string[] = [];
            const params: unknown[] = [];
            let paramIndex = 1;

            if (search) {
              params.push(`%${search}%`);
              where.push(`(patient_name ILIKE $${paramIndex} OR COALESCE(patient_email, '') ILIKE $${paramIndex} OR COALESCE(concern, '') ILIKE $${paramIndex} OR COALESCE(assigned_to, '') ILIKE $${paramIndex} OR case_id ILIKE $${paramIndex})`);
              paramIndex += 1;
            }

            if (status && status.toLowerCase() !== 'all statuses') {
              params.push(status.toLowerCase());
              where.push(`LOWER(status) = $${paramIndex}`);
              paramIndex += 1;
            }

            const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
            let orderBy = ' ORDER BY intake_time DESC';
            if (sort === 'Sort Name A-Z') orderBy = ' ORDER BY patient_name ASC';
            if (sort === 'Sort Name Z-A') orderBy = ' ORDER BY patient_name DESC';

            const countRows = (await sql.query(`SELECT COUNT(*)::int AS total FROM patient_registrations${whereSql}`, params)) as Array<{ total: number }>;
            const total = Number(countRows[0]?.total || 0);

            const items = await sql.query(
              `SELECT id, case_id, patient_name, patient_email, age, concern, intake_time, booked_time, status, assigned_to
               FROM patient_registrations${whereSql}${orderBy}
               LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
              [...params, perPage, offset]
            );

            const [pendingRows, activeRows, concernRows, totalRows] = await Promise.all([
              sql.query(`SELECT COUNT(*)::int AS total FROM patient_registrations WHERE LOWER(status) = 'pending'`),
              sql.query(`SELECT COUNT(*)::int AS total FROM patient_registrations WHERE LOWER(status) = 'active'`),
              sql.query(`SELECT COUNT(*)::int AS total FROM patient_registrations WHERE COALESCE(TRIM(concern), '') <> ''`),
              sql.query(`SELECT COUNT(*)::int AS total FROM patient_registrations`)
            ]);

            const pending = Number((pendingRows as Array<{ total: number }>)[0]?.total || 0);
            const active = Number((activeRows as Array<{ total: number }>)[0]?.total || 0);
            const concerns = Number((concernRows as Array<{ total: number }>)[0]?.total || 0);
            const totalAll = Number((totalRows as Array<{ total: number }>)[0]?.total || 0);
            const approvalRate = totalAll > 0 ? Math.round((active / totalAll) * 100) : 0;

            writeJson(res, 200, {
              ok: true,
              data: {
                analytics: {
                  pending,
                  active,
                  concerns,
                  approvalRate
                },
                items: Array.isArray(items) ? items : [],
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

          if (url.pathname === '/api/walk-ins' && (req.method || 'GET').toUpperCase() === 'GET') {
            await sql.query(`
              CREATE TABLE IF NOT EXISTS patient_walkins (
                id BIGSERIAL PRIMARY KEY,
                case_id VARCHAR(40) NOT NULL UNIQUE,
                patient_name VARCHAR(150) NOT NULL,
                age SMALLINT NULL,
                contact VARCHAR(80) NULL,
                chief_complaint TEXT NULL,
                severity VARCHAR(20) NOT NULL DEFAULT 'Low',
                intake_time TIMESTAMP NOT NULL DEFAULT NOW(),
                assigned_doctor VARCHAR(120) NOT NULL DEFAULT 'Nurse Triage',
                status VARCHAR(30) NOT NULL DEFAULT 'waiting',
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
              )
            `);

            const search = (url.searchParams.get('search') || '').trim();
            const status = (url.searchParams.get('status') || '').trim();
            const severity = (url.searchParams.get('severity') || '').trim();
            const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
            const perPage = Math.min(50, Math.max(1, Number(url.searchParams.get('per_page') || '10')));
            const offset = (page - 1) * perPage;

            const where: string[] = [];
            const params: unknown[] = [];
            let paramIndex = 1;

            if (search) {
              params.push(`%${search}%`);
              where.push(`(case_id ILIKE $${paramIndex} OR patient_name ILIKE $${paramIndex} OR COALESCE(contact, '') ILIKE $${paramIndex} OR COALESCE(chief_complaint, '') ILIKE $${paramIndex} OR COALESCE(assigned_doctor, '') ILIKE $${paramIndex})`);
              paramIndex += 1;
            }

            if (status && status.toLowerCase() !== 'all') {
              params.push(status.toLowerCase());
              where.push(`LOWER(status) = $${paramIndex}`);
              paramIndex += 1;
            }

            if (severity && severity.toLowerCase() !== 'all') {
              params.push(severity.toLowerCase());
              where.push(`LOWER(severity) = $${paramIndex}`);
              paramIndex += 1;
            }

            const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
            const countRows = (await sql.query(`SELECT COUNT(*)::int AS total FROM patient_walkins${whereSql}`, params)) as Array<{ total: number }>;
            const total = Number(countRows[0]?.total || 0);

            const items = await sql.query(
              `SELECT id, case_id, patient_name, age, contact, chief_complaint, severity, intake_time, assigned_doctor, status
               FROM patient_walkins${whereSql}
               ORDER BY
                 CASE WHEN status = 'emergency' OR severity = 'Emergency' THEN 0 ELSE 1 END ASC,
                 CASE severity WHEN 'Emergency' THEN 0 WHEN 'Moderate' THEN 1 ELSE 2 END ASC,
                 intake_time ASC
               LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
              [...params, perPage, offset]
            );

            const [allRows, triageRows, doctorRows, emergencyRows, completedRows] = await Promise.all([
              sql.query(`SELECT COUNT(*)::int AS total FROM patient_walkins`),
              sql.query(`SELECT COUNT(*)::int AS total FROM patient_walkins WHERE status = 'triage_pending'`),
              sql.query(`SELECT COUNT(*)::int AS total FROM patient_walkins WHERE status = 'waiting_for_doctor'`),
              sql.query(`SELECT COUNT(*)::int AS total FROM patient_walkins WHERE status = 'emergency'`),
              sql.query(`SELECT COUNT(*)::int AS total FROM patient_walkins WHERE status = 'completed'`)
            ]);

            writeJson(res, 200, {
              ok: true,
              data: {
                analytics: {
                  all: Number((allRows as Array<{ total: number }>)[0]?.total || 0),
                  triage: Number((triageRows as Array<{ total: number }>)[0]?.total || 0),
                  doctor: Number((doctorRows as Array<{ total: number }>)[0]?.total || 0),
                  emergency: Number((emergencyRows as Array<{ total: number }>)[0]?.total || 0),
                  completed: Number((completedRows as Array<{ total: number }>)[0]?.total || 0)
                },
                items: Array.isArray(items) ? items : [],
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

          if (url.pathname === '/api/walk-ins' && (req.method || '').toUpperCase() === 'POST') {
            await sql.query(`
              CREATE TABLE IF NOT EXISTS patient_walkins (
                id BIGSERIAL PRIMARY KEY,
                case_id VARCHAR(40) NOT NULL UNIQUE,
                patient_name VARCHAR(150) NOT NULL,
                age SMALLINT NULL,
                contact VARCHAR(80) NULL,
                chief_complaint TEXT NULL,
                severity VARCHAR(20) NOT NULL DEFAULT 'Low',
                intake_time TIMESTAMP NOT NULL DEFAULT NOW(),
                assigned_doctor VARCHAR(120) NOT NULL DEFAULT 'Nurse Triage',
                status VARCHAR(30) NOT NULL DEFAULT 'waiting',
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
              )
            `);

            const body = await readJsonBody(req);
            const action = String(body.action || '').trim().toLowerCase();

            if (action === 'create') {
              const patientName = String(body.patient_name || '').trim();
              if (!patientName) {
                writeJson(res, 422, { ok: false, message: 'patient_name is required.' });
                return;
              }

              const now = new Date();
              const yyyy = now.getFullYear();
              const mm = String(now.getMonth() + 1).padStart(2, '0');
              const serial = Math.floor(100 + Math.random() * 900);
              const caseId = `WALK-${yyyy}-${mm}${serial}`;

              const createdRows = await sql.query(
                `INSERT INTO patient_walkins (case_id, patient_name, age, contact, chief_complaint, severity, intake_time, assigned_doctor, status)
                 VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,'waiting')
                 RETURNING id, case_id, patient_name, age, contact, chief_complaint, severity, intake_time, assigned_doctor, status`,
                [
                  caseId,
                  patientName,
                  body.age ?? null,
                  String(body.contact || '').trim() || null,
                  String(body.chief_complaint || '').trim() || null,
                  String(body.severity || 'Low').trim() || 'Low',
                  String(body.assigned_doctor || 'Nurse Triage').trim() || 'Nurse Triage'
                ]
              );
              writeJson(res, 200, { ok: true, message: 'Walk-in created.', data: Array.isArray(createdRows) ? createdRows[0] : null });
              return;
            }

            const id = Number(body.id || 0);
            if (!id) {
              writeJson(res, 422, { ok: false, message: 'id is required.' });
              return;
            }

            const currentRows = await sql.query(
              `SELECT id, status, severity FROM patient_walkins WHERE id = $1 LIMIT 1`,
              [id]
            ) as Array<{ id: number; status: string; severity: string }>;

            if (!Array.isArray(currentRows) || currentRows.length === 0) {
              writeJson(res, 404, { ok: false, message: 'Walk-in case not found.' });
              return;
            }

            const currentStatus = String(currentRows[0].status || '');

            if (action === 'identify') {
              if (currentStatus !== 'waiting') {
                writeJson(res, 422, { ok: false, message: 'Only waiting patients can be identified.' });
                return;
              }
              const rows = await sql.query(
                `UPDATE patient_walkins SET status = 'identified', updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, case_id, patient_name, age, contact, chief_complaint, severity, intake_time, assigned_doctor, status`,
                [id]
              );
              writeJson(res, 200, { ok: true, data: Array.isArray(rows) ? rows[0] : null });
              return;
            }

            if (action === 'queue_triage') {
              if (currentStatus !== 'identified') {
                writeJson(res, 422, { ok: false, message: 'Only identified patients can be moved to triage_pending.' });
                return;
              }
              const rows = await sql.query(
                `UPDATE patient_walkins SET status = 'triage_pending', updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, case_id, patient_name, age, contact, chief_complaint, severity, intake_time, assigned_doctor, status`,
                [id]
              );
              writeJson(res, 200, { ok: true, data: Array.isArray(rows) ? rows[0] : null });
              return;
            }

            if (action === 'start_triage') {
              if (currentStatus !== 'triage_pending') {
                writeJson(res, 422, { ok: false, message: 'Start triage is only allowed from triage_pending.' });
                return;
              }
              const rows = await sql.query(
                `UPDATE patient_walkins
                 SET status = 'in_triage', updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, case_id, patient_name, age, contact, chief_complaint, severity, intake_time, assigned_doctor, status`,
                [id]
              );
              writeJson(res, 200, { ok: true, data: Array.isArray(rows) ? rows[0] : null });
              return;
            }

            if (action === 'triage') {
              if (currentStatus !== 'in_triage') {
                writeJson(res, 422, { ok: false, message: 'Save triage is only allowed from in_triage.' });
                return;
              }
              const severityValue = String(body.severity || 'Low').trim();
              const nextStatus = severityValue === 'Emergency' ? 'emergency' : 'waiting_for_doctor';
              const rows = await sql.query(
                `UPDATE patient_walkins
                 SET chief_complaint = COALESCE($1, chief_complaint),
                     severity = $2,
                     status = $3,
                     updated_at = NOW()
                 WHERE id = $4
                 RETURNING id, case_id, patient_name, age, contact, chief_complaint, severity, intake_time, assigned_doctor, status`,
                [String(body.chief_complaint || '').trim() || null, severityValue, nextStatus, id]
              );
              writeJson(res, 200, { ok: true, data: Array.isArray(rows) ? rows[0] : null });
              return;
            }

            if (action === 'assign') {
              if (currentStatus !== 'waiting_for_doctor') {
                writeJson(res, 422, { ok: false, message: 'Doctor assignment requires waiting_for_doctor status.' });
                return;
              }
              const rows = await sql.query(
                `UPDATE patient_walkins
                 SET assigned_doctor = COALESCE($1, assigned_doctor),
                     status = 'waiting_for_doctor',
                     updated_at = NOW()
                 WHERE id = $2
                 RETURNING id, case_id, patient_name, age, contact, chief_complaint, severity, intake_time, assigned_doctor, status`,
                [String(body.assigned_doctor || '').trim() || null, id]
              );
              writeJson(res, 200, { ok: true, data: Array.isArray(rows) ? rows[0] : null });
              return;
            }

            if (action === 'complete') {
              if (currentStatus !== 'waiting_for_doctor') {
                writeJson(res, 422, { ok: false, message: 'Case can only be completed after doctor queue stage.' });
                return;
              }
              const rows = await sql.query(
                `UPDATE patient_walkins SET status = 'completed', updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, case_id, patient_name, age, contact, chief_complaint, severity, intake_time, assigned_doctor, status`,
                [id]
              );
              writeJson(res, 200, { ok: true, data: Array.isArray(rows) ? rows[0] : null });
              return;
            }

            if (action === 'emergency') {
              if (currentStatus === 'completed') {
                writeJson(res, 422, { ok: false, message: 'Completed case cannot be escalated to emergency.' });
                return;
              }
              const rows = await sql.query(
                `UPDATE patient_walkins
                 SET status = 'emergency', severity = 'Emergency', assigned_doctor = 'ER Team', updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, case_id, patient_name, age, contact, chief_complaint, severity, intake_time, assigned_doctor, status`,
                [id]
              );
              writeJson(res, 200, { ok: true, data: Array.isArray(rows) ? rows[0] : null });
              return;
            }

            writeJson(res, 422, { ok: false, message: 'Unsupported action.' });
            return;
          }

          if (url.pathname === '/api/registrations' && (req.method || '').toUpperCase() === 'POST') {
            await sql.query(`
              CREATE TABLE IF NOT EXISTS patient_registrations (
                id BIGSERIAL PRIMARY KEY,
                case_id VARCHAR(40) NOT NULL UNIQUE,
                patient_name VARCHAR(150) NOT NULL,
                patient_email VARCHAR(190) NULL,
                age SMALLINT NULL,
                concern TEXT NULL,
                intake_time TIMESTAMP NOT NULL DEFAULT NOW(),
                booked_time TIMESTAMP NOT NULL DEFAULT NOW(),
                status VARCHAR(20) NOT NULL DEFAULT 'Pending',
                assigned_to VARCHAR(120) NOT NULL DEFAULT 'Unassigned',
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
              )
            `);

            const body = await readJsonBody(req);
            const action = String(body.action || '').trim().toLowerCase();

            if (action === 'create') {
              const patientName = String(body.patient_name || '').trim();
              if (!patientName) {
                writeJson(res, 422, { ok: false, message: 'patient_name is required.' });
                return;
              }

              const now = new Date();
              const yyyy = now.getFullYear();
              const mm = String(now.getMonth() + 1).padStart(2, '0');
              const dd = String(now.getDate()).padStart(2, '0');
              const serial = Math.floor(1000 + Math.random() * 9000);
              const caseId = `REG-${yyyy}${mm}${dd}-${serial}`;

              const createdRows = await sql.query(
                `INSERT INTO patient_registrations (case_id, patient_name, patient_email, age, concern, intake_time, booked_time, status, assigned_to)
                 VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamp, NOW()),COALESCE($7::timestamp, NOW()),$8,$9)
                 RETURNING id, case_id, patient_name, patient_email, age, concern, intake_time, booked_time, status, assigned_to`,
                [
                  caseId,
                  patientName,
                  String(body.patient_email || '').trim() || null,
                  body.age ?? null,
                  String(body.concern || '').trim() || null,
                  String(body.intake_time || '').trim() || null,
                  String(body.booked_time || '').trim() || null,
                  String(body.status || 'Pending').trim() || 'Pending',
                  String(body.assigned_to || 'Unassigned').trim() || 'Unassigned'
                ]
              );

              writeJson(res, 200, { ok: true, message: 'Registration created.', data: Array.isArray(createdRows) ? createdRows[0] : null });
              return;
            }

            if (action === 'update') {
              const id = Number(body.id || 0);
              if (!id) {
                writeJson(res, 422, { ok: false, message: 'id is required.' });
                return;
              }

              const updatedRows = await sql.query(
                `UPDATE patient_registrations SET
                    patient_name = COALESCE($1, patient_name),
                    patient_email = $2,
                    age = $3,
                    concern = $4,
                    intake_time = COALESCE($5::timestamp, intake_time),
                    booked_time = COALESCE($6::timestamp, booked_time),
                    status = COALESCE($7, status),
                    assigned_to = COALESCE($8, assigned_to),
                    updated_at = NOW()
                 WHERE id = $9
                 RETURNING id, case_id, patient_name, patient_email, age, concern, intake_time, booked_time, status, assigned_to`,
                [
                  String(body.patient_name || '').trim() || null,
                  String(body.patient_email || '').trim() || null,
                  body.age ?? null,
                  String(body.concern || '').trim() || null,
                  String(body.intake_time || '').trim() || null,
                  String(body.booked_time || '').trim() || null,
                  String(body.status || '').trim() || null,
                  String(body.assigned_to || '').trim() || null,
                  id
                ]
              );

              if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
                writeJson(res, 404, { ok: false, message: 'Registration not found.' });
                return;
              }

              writeJson(res, 200, { ok: true, message: 'Registration updated.', data: updatedRows[0] });
              return;
            }

            if (action === 'approve') {
              const id = Number(body.id || 0);
              if (!id) {
                writeJson(res, 422, { ok: false, message: 'id is required.' });
                return;
              }

              const approvedRows = await sql.query(
                `UPDATE patient_registrations
                 SET status = 'Active', updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, case_id, patient_name, patient_email, age, concern, intake_time, booked_time, status, assigned_to`,
                [id]
              );

              if (!Array.isArray(approvedRows) || approvedRows.length === 0) {
                writeJson(res, 404, { ok: false, message: 'Registration not found.' });
                return;
              }

              writeJson(res, 200, { ok: true, message: 'Registration approved.', data: approvedRows[0] });
              return;
            }

            writeJson(res, 422, { ok: false, message: 'Unsupported action.' });
            return;
          }

          if ((req.method || 'GET').toUpperCase() === 'GET') {
            const search = (url.searchParams.get('search') || '').trim();
            const status = (url.searchParams.get('status') || '').trim();
            const service = (url.searchParams.get('service') || '').trim();
            const doctor = normalizeDoctorFilter((url.searchParams.get('doctor') || '').trim());
            const period = (url.searchParams.get('period') || '').trim().toLowerCase();
            const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
            const perPage = Math.min(50, Math.max(1, Number(url.searchParams.get('per_page') || '10')));
            const offset = (page - 1) * perPage;

            const where: string[] = [];
            const params: unknown[] = [];
            let paramIndex = 1;

            if (search) {
              params.push(`%${search}%`);
              where.push(`(patient_name ILIKE $${paramIndex} OR patient_email ILIKE $${paramIndex} OR phone_number ILIKE $${paramIndex} OR booking_id ILIKE $${paramIndex})`);
              paramIndex += 1;
            }

            if (status && status.toLowerCase() !== 'all statuses') {
              params.push(status.toLowerCase());
              where.push(`LOWER(status) = $${paramIndex}`);
              paramIndex += 1;
            }

            if (service && service.toLowerCase() !== 'all services') {
              params.push(service.toLowerCase());
              where.push(`(LOWER(COALESCE(visit_type, department_name, '')) = $${paramIndex} OR LOWER(department_name) = $${paramIndex})`);
              paramIndex += 1;
            }

            if (doctor && doctor.toLowerCase() !== 'any') {
              params.push(doctor.toLowerCase());
              where.push(`LOWER(doctor_name) = $${paramIndex}`);
              paramIndex += 1;
            }

            if (period === 'today') {
              where.push('appointment_date = CURRENT_DATE');
            } else if (period === 'this week') {
              where.push("appointment_date >= DATE_TRUNC('week', CURRENT_DATE)::date AND appointment_date < (DATE_TRUNC('week', CURRENT_DATE)::date + INTERVAL '7 days')");
            } else if (period === 'this month') {
              where.push("appointment_date >= DATE_TRUNC('month', CURRENT_DATE)::date AND appointment_date < (DATE_TRUNC('month', CURRENT_DATE)::date + INTERVAL '1 month')");
            } else if (period === 'period: upcoming' || period === 'upcoming') {
              where.push('appointment_date >= CURRENT_DATE');
            }

            const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

            const countQuery = `SELECT COUNT(*)::int AS total FROM patient_appointments${whereSql}`;
            const countRows = (await sql.query(countQuery, params)) as Array<{ total: number }>;
            const total = Number(countRows[0]?.total || 0);

            const dataQuery = `
              SELECT
                id,
                booking_id,
                patient_name,
                patient_email,
                phone_number,
                doctor_name,
                COALESCE(NULLIF(visit_type, ''), department_name, 'General Check-Up') AS service_name,
                department_name,
                appointment_date,
                preferred_time,
                status,
                visit_reason,
                created_at,
                updated_at
              FROM patient_appointments
              ${whereSql}
              ORDER BY appointment_date ASC, preferred_time ASC NULLS LAST
              LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;
            const items = await sql.query(dataQuery, [...params, perPage, offset]);

            const [totalAppointmentsRows, todayRows, pendingRows, totalPatientsRows] = await Promise.all([
              sql.query('SELECT COUNT(*)::int AS total FROM patient_appointments'),
              sql.query('SELECT COUNT(*)::int AS total FROM patient_appointments WHERE appointment_date = CURRENT_DATE'),
              sql.query("SELECT COUNT(*)::int AS total FROM patient_appointments WHERE LOWER(COALESCE(status, '')) IN ('pending', 'awaiting')"),
              sql.query("SELECT COUNT(DISTINCT COALESCE(NULLIF(TRIM(patient_email), ''), NULLIF(TRIM(phone_number), ''), patient_name))::int AS total FROM patient_appointments")
            ]);

            writeJson(res, 200, {
              ok: true,
              data: {
                analytics: {
                  totalPatients: Number((totalPatientsRows as Array<{ total: number }>)[0]?.total || 0),
                  totalAppointments: Number((totalAppointmentsRows as Array<{ total: number }>)[0]?.total || 0),
                  todayAppointments: Number((todayRows as Array<{ total: number }>)[0]?.total || 0),
                  pendingQueue: Number((pendingRows as Array<{ total: number }>)[0]?.total || 0)
                },
                items: Array.isArray(items) ? items : [],
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

          if ((req.method || '').toUpperCase() === 'POST') {
            const body = await readJsonBody(req);
            const action = String(body.action || 'update').trim().toLowerCase();

            if (action === 'create') {
              const patientName = String(body.patient_name || '').trim();
              const phoneNumber = String(body.phone_number || '').trim();
              const doctorName = String(body.doctor_name || '').trim();
              const departmentName = String(body.department_name || '').trim();
              const visitType = String(body.visit_type || '').trim();
              const appointmentDate = String(body.appointment_date || '').trim();
              const preferredTime = String(body.preferred_time || '').trim();
              const status = String(body.status || 'Pending').trim() || 'Pending';

              if (!patientName || !phoneNumber || !doctorName || !departmentName || !visitType || !appointmentDate) {
                writeJson(res, 422, { ok: false, message: 'Missing required create fields.' });
                return;
              }

              const now = new Date();
              const yyyy = now.getFullYear();
              const mm = String(now.getMonth() + 1).padStart(2, '0');
              const dd = String(now.getDate()).padStart(2, '0');
              const serial = Math.floor(1000 + Math.random() * 9000);
              const bookingId = `APT-${yyyy}${mm}${dd}-${serial}`;

              const insertQuery = `
                INSERT INTO patient_appointments (
                  booking_id,
                  patient_name,
                  patient_age,
                  patient_email,
                  patient_gender,
                  phone_number,
                  doctor_name,
                  department_name,
                  visit_type,
                  appointment_date,
                  preferred_time,
                  visit_reason,
                  status
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                )
                RETURNING
                  id,
                  booking_id,
                  patient_name,
                  patient_email,
                  phone_number,
                  doctor_name,
                  COALESCE(NULLIF(visit_type, ''), department_name, 'General Check-Up') AS service_name,
                  department_name,
                  appointment_date,
                  preferred_time,
                  status,
                  visit_reason,
                  created_at,
                  updated_at
              `;

              const createdRows = await sql.query(insertQuery, [
                bookingId,
                patientName,
                body.patient_age ?? null,
                String(body.patient_email || '').trim() || null,
                String(body.patient_gender || '').trim() || null,
                phoneNumber,
                doctorName,
                departmentName,
                visitType,
                appointmentDate,
                preferredTime || null,
                String(body.visit_reason || '').trim() || null,
                status
              ]);

              writeJson(res, 200, {
                ok: true,
                message: 'Appointment created.',
                data: Array.isArray(createdRows) ? createdRows[0] : null
              });
              return;
            }

            const bookingId = String(body.booking_id || '').trim();
            if (!bookingId) {
              writeJson(res, 422, { ok: false, message: 'booking_id is required.' });
              return;
            }

            const fieldMap: Record<string, string> = {
              status: 'status',
              doctor_name: 'doctor_name',
              department_name: 'department_name',
              visit_type: 'visit_type',
              appointment_date: 'appointment_date',
              preferred_time: 'preferred_time',
              visit_reason: 'visit_reason'
            };

            const setParts: string[] = [];
            const values: unknown[] = [];

            Object.entries(fieldMap).forEach(([key, column]) => {
              if (!(key in body)) return;
              const value = typeof body[key] === 'string' ? String(body[key]).trim() : body[key];
              values.push(value === '' ? null : value);
              setParts.push(`${column} = $${values.length}`);
            });

            if (!setParts.length) {
              writeJson(res, 422, { ok: false, message: 'No fields to update.' });
              return;
            }

            values.push(bookingId);
            const bookingIndex = values.length;
            const updateQuery = `
              UPDATE patient_appointments
              SET ${setParts.join(', ')}, updated_at = NOW()
              WHERE booking_id = $${bookingIndex}
              RETURNING
                id,
                booking_id,
                patient_name,
                patient_email,
                phone_number,
                doctor_name,
                COALESCE(NULLIF(visit_type, ''), department_name, 'General Check-Up') AS service_name,
                department_name,
                appointment_date,
                preferred_time,
                status,
                visit_reason,
                created_at,
                updated_at
            `;

            const updatedRows = await sql.query(updateQuery, values);
            if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
              writeJson(res, 404, { ok: false, message: 'Appointment not found.' });
              return;
            }

            writeJson(res, 200, {
              ok: true,
              message: 'Appointment updated.',
              data: updatedRows[0]
            });
            return;
          }

          writeJson(res, 405, { ok: false, message: 'Method not allowed.' });
        } catch (error) {
          writeJson(res, 500, {
            ok: false,
            message: error instanceof Error ? error.message : 'Failed to query appointments.'
          });
        }
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost';
  const devBackendRoot = normalizePathPrefix(env.VITE_DEV_BACKEND_ROOT || '/Clinic%20System');
  const databaseUrl = env.DATABASE_URL?.trim();

  return {
    plugins: [
      neonAppointmentsApiPlugin(databaseUrl),
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => ['v-list-recognize-title'].includes(tag)
          }
        }
      }),
      vuetify({
        autoImport: true
      })
    ],
    base: './',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    css: {
      preprocessorOptions: {
        scss: {}
      }
    },
    server: {
      proxy: {
        '/backend': {
          target: devProxyTarget,
          changeOrigin: true,
          rewrite: (path) => `${devBackendRoot}${path}`
        }
      }
    },
    build: {
      chunkSizeWarningLimit: 1024 * 1024 // Set the limit to 1 MB
    },
    optimizeDeps: {
      exclude: ['vuetify'],
      entries: ['./src/**/*.vue']
    }
  };
});
