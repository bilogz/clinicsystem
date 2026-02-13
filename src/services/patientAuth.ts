export type PatientAccount = {
  patientCode: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  sex?: string | null;
  dateOfBirth?: string | null;
  guardianName?: string | null;
  emailVerified?: boolean;
};

export type PatientSessionResponse = {
  authenticated: boolean;
  account: PatientAccount | null;
  verificationRequired?: boolean;
  verificationEmail?: string;
  devVerificationCode?: string;
  resetEmail?: string;
  devResetCode?: string;
};

type AuthApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
};

async function parseResponse<T>(response: Response): Promise<AuthApiResponse<T>> {
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as AuthApiResponse<T>) : ({ ok: false } as AuthApiResponse<T>);
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || `Request failed (${response.status})`);
  }
  return payload;
}

export async function fetchPatientSession(): Promise<PatientSessionResponse> {
  const response = await fetch('/api/patient-auth', { credentials: 'include' });
  const payload = await parseResponse<PatientSessionResponse>(response);
  return payload.data || { authenticated: false, account: null };
}

export async function signupPatientAccount(payload: {
  full_name: string;
  email: string;
  phone_number: string;
  password: string;
  sex?: string;
  date_of_birth?: string;
  guardian_name?: string;
}): Promise<PatientSessionResponse> {
  const response = await fetch('/api/patient-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action: 'signup', ...payload })
  });
  const parsed = await parseResponse<PatientSessionResponse>(response);
  return parsed.data || { authenticated: false, account: null };
}

export async function loginPatientAccount(payload: { email: string; password: string }): Promise<PatientSessionResponse> {
  const response = await fetch('/api/patient-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action: 'login', ...payload })
  });
  const parsed = await parseResponse<PatientSessionResponse>(response);
  return parsed.data || { authenticated: false, account: null };
}

export async function requestEmailVerification(email: string): Promise<PatientSessionResponse> {
  const response = await fetch('/api/patient-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action: 'request_email_verification', email })
  });
  const parsed = await parseResponse<PatientSessionResponse>(response);
  return parsed.data || { authenticated: false, account: null };
}

export async function verifyPatientEmail(payload: { email: string; code: string }): Promise<PatientSessionResponse> {
  const response = await fetch('/api/patient-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action: 'verify_email', ...payload })
  });
  const parsed = await parseResponse<PatientSessionResponse>(response);
  return parsed.data || { authenticated: false, account: null };
}

export async function requestPasswordReset(email: string): Promise<PatientSessionResponse> {
  const response = await fetch('/api/patient-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action: 'request_password_reset', email })
  });
  const parsed = await parseResponse<PatientSessionResponse>(response);
  return parsed.data || { authenticated: false, account: null };
}

export async function resetPatientPassword(payload: { email: string; code: string; new_password: string }): Promise<void> {
  const response = await fetch('/api/patient-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action: 'reset_password', ...payload })
  });
  await parseResponse<Record<string, never>>(response);
}

export async function logoutPatientAccount(): Promise<void> {
  const response = await fetch('/api/patient-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action: 'logout' })
  });
  await parseResponse<Record<string, never>>(response);
}
