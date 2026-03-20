export type RegistrarDirectoryRole = 'student' | 'teacher';

export type RegistrarDirectoryPerson = {
  code: string;
  fullName: string;
  firstName: string;
  lastName: string;
  department?: string;
  program?: string;
  yearLevel?: string;
  type: RegistrarDirectoryRole;
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveSupabaseUrl(): string {
  const configured = import.meta.env.VITE_SUPABASE_URL?.trim();
  return configured ? trimTrailingSlashes(configured) : '';
}

function resolveSupabaseKey(): string {
  return (
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ''
  );
}

async function fetchRegistrarRows(
  viewName: 'registrar_students' | 'registrar_instructors',
  select: string,
  orderBy: string
): Promise<Array<Record<string, unknown>>> {
  const supabaseUrl = resolveSupabaseUrl();
  const supabaseKey = resolveSupabaseKey();

  if (!supabaseUrl || !supabaseKey) {
    return [];
  }

  const params = new URLSearchParams();
  params.set('select', select);
  params.set('order', orderBy);
  params.set('limit', '200');

  const response = await fetch(`${supabaseUrl}/rest/v1/${viewName}?${params.toString()}`, {
    method: 'GET',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

export async function listRegistrarPeople(role: RegistrarDirectoryRole): Promise<RegistrarDirectoryPerson[]> {
  if (role === 'teacher') {
    const rows = await fetchRegistrarRows(
      'registrar_instructors',
      'employee_no,first_name,last_name,department',
      'last_name.asc'
    );

    return rows
      .map((row) => ({
        code: String(row.employee_no || '').trim(),
        firstName: String(row.first_name || '').trim(),
        lastName: String(row.last_name || '').trim(),
        department: String(row.department || '').trim(),
        type: 'teacher' as const,
        fullName: [String(row.first_name || '').trim(), String(row.last_name || '').trim()].filter(Boolean).join(' ')
      }))
      .filter((row) => row.code && row.fullName);
  }

  const rows = await fetchRegistrarRows(
    'registrar_students',
    'student_no,first_name,last_name,program,year_level',
    'last_name.asc'
  );

  return rows
    .map((row) => ({
      code: String(row.student_no || '').trim(),
      firstName: String(row.first_name || '').trim(),
      lastName: String(row.last_name || '').trim(),
      program: String(row.program || '').trim(),
      yearLevel: String(row.year_level || '').trim(),
      type: 'student' as const,
      fullName: [String(row.first_name || '').trim(), String(row.last_name || '').trim()].filter(Boolean).join(' ')
    }))
    .filter((row) => row.code && row.fullName);
}
