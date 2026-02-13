export type PatientPortalAnalytics = {
  total: number;
  upcoming: number;
  pending: number;
  confirmed: number;
};

export type PatientPortalAppointment = {
  bookingId: string;
  doctorName: string;
  department: string;
  appointmentDate: string;
  preferredTime: string;
  status: string;
  reason: string;
};

export type PatientPortalData = {
  profile: {
    patientCode: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    sex?: string | null;
    dateOfBirth?: string | null;
    guardianName?: string | null;
    emailVerified?: boolean;
  };
  analytics: PatientPortalAnalytics;
  appointments: PatientPortalAppointment[];
};

type ApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
};

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as ApiResponse<T>) : ({ ok: false } as ApiResponse<T>);
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || `Request failed (${response.status})`);
  }
  return payload;
}

export async function fetchPatientPortal(): Promise<PatientPortalData> {
  const response = await fetch('/api/patient-portal', { credentials: 'include' });
  const payload = await parseResponse<PatientPortalData>(response);
  if (!payload.data) {
    throw new Error('No patient portal data returned.');
  }
  return payload.data;
}

export async function updatePatientProfile(payload: {
  full_name: string;
  phone_number: string;
  sex?: string;
  date_of_birth?: string;
  guardian_name?: string;
}): Promise<{
  authenticated: boolean;
  account: {
    patientCode: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    sex?: string | null;
    dateOfBirth?: string | null;
    guardianName?: string | null;
    emailVerified?: boolean;
  };
}> {
  const response = await fetch('/api/patient-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      action: 'update_profile',
      ...payload
    })
  });
  const parsed = await parseResponse<{
    authenticated: boolean;
    account: {
      patientCode: string;
      fullName: string;
      email: string;
      phoneNumber: string;
      sex?: string | null;
      dateOfBirth?: string | null;
      guardianName?: string | null;
      emailVerified?: boolean;
    };
  }>(response);
  if (!parsed.data) {
    throw new Error('Profile update returned no data.');
  }
  return parsed.data;
}
