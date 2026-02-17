import { fetchApiData, invalidateApiCache } from '@/services/apiClient';

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

export async function fetchPatientPortal(): Promise<PatientPortalData> {
  return await fetchApiData<PatientPortalData>('/api/patient-portal', { ttlMs: 10_000 });
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
  const data = await fetchApiData<{
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
  }>('/api/patient-portal', {
    method: 'POST',
    body: {
      action: 'update_profile',
      ...payload
    }
  });
  invalidateApiCache('/api/patient-portal');
  invalidateApiCache('/api/patient-auth');
  return data;
}
