const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { randomBytes, scryptSync } = require('crypto');

function readDatabaseUrl() {
  const envPath = path.resolve(__dirname, '../.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const line = raw
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith('DATABASE_URL='));
  if (!line) {
    throw new Error('DATABASE_URL is missing in clinicsystem/.env');
  }
  return line.slice('DATABASE_URL='.length).trim();
}

async function run() {
  const databaseUrl = readDatabaseUrl();
  const email = 'admin@gmail.com';
  const password = 'admin123';
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  const passwordHash = `${salt}:${hash}`;

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query(
    `INSERT INTO public.admin_profiles
      (username, full_name, email, role, department, access_exemptions, is_super_admin, password_hash, status, phone)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (username) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      department = EXCLUDED.department,
      access_exemptions = EXCLUDED.access_exemptions,
      is_super_admin = EXCLUDED.is_super_admin,
      password_hash = EXCLUDED.password_hash,
      status = EXCLUDED.status,
      phone = EXCLUDED.phone`,
    [
      email,
      'Clinic Default Admin',
      email,
      'Admin',
      'Administration',
      [
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
      ],
      1,
      passwordHash,
      'active',
      '',
    ]
  );

  const { rows } = await client.query(
    'SELECT username, email, status, is_super_admin FROM public.admin_profiles WHERE username = $1 LIMIT 1',
    [email]
  );
  console.log(JSON.stringify(rows[0] || null));
  await client.end();
}

run().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
