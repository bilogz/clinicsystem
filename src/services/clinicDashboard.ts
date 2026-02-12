export type ClinicSummary = {
  totalPatients: number;
  totalAppointments: number;
  todayAppointments: number;
  pendingAppointments: number;
  completedToday: number;
  newPatientsThisMonth: number;
};

export type ClinicTrendPoint = {
  key: string;
  label: string;
  total: number;
};

export type ClinicBreakdown = {
  label: string;
  total: number;
};

export type UpcomingAppointment = {
  bookingId: string;
  patientName: string;
  doctorName: string;
  department: string;
  appointmentDate: string;
  preferredTime: string;
  status: string;
};

export type RecentPatient = {
  patientId: string;
  patientName: string;
  patientGender: string;
  createdAt: string;
};

export type ClinicDashboardPayload = {
  generatedAt: string;
  summary: ClinicSummary;
  appointmentsTrend: ClinicTrendPoint[];
  statusBreakdown: ClinicBreakdown[];
  departmentBreakdown: ClinicBreakdown[];
  upcomingAppointments: UpcomingAppointment[];
  recentPatients: RecentPatient[];
};

export async function fetchClinicDashboard(): Promise<ClinicDashboardPayload> {
  const now = new Date();
  const iso = now.toISOString();

  return {
    generatedAt: iso,
    summary: {
      totalPatients: 148,
      totalAppointments: 376,
      todayAppointments: 23,
      pendingAppointments: 9,
      completedToday: 14,
      newPatientsThisMonth: 32
    },
    appointmentsTrend: [
      { key: 'sep', label: 'Sep', total: 38 },
      { key: 'oct', label: 'Oct', total: 47 },
      { key: 'nov', label: 'Nov', total: 55 },
      { key: 'dec', label: 'Dec', total: 50 },
      { key: 'jan', label: 'Jan', total: 61 },
      { key: 'feb', label: 'Feb', total: 59 }
    ],
    statusBreakdown: [
      { label: 'Pending', total: 9 },
      { label: 'Accepted', total: 12 },
      { label: 'Completed', total: 14 },
      { label: 'Cancelled', total: 2 }
    ],
    departmentBreakdown: [
      { label: 'General Medicine', total: 10 },
      { label: 'Pediatrics', total: 4 },
      { label: 'Dermatology', total: 3 },
      { label: 'Cardiology', total: 2 }
    ],
    upcomingAppointments: [
      {
        bookingId: 'BK-2041',
        patientName: 'Maria Santos',
        doctorName: 'Dr. Humour',
        department: 'General Medicine',
        appointmentDate: iso,
        preferredTime: '09:30 AM',
        status: 'Accepted'
      },
      {
        bookingId: 'BK-2042',
        patientName: 'John Reyes',
        doctorName: 'Dr. Molina',
        department: 'Pediatrics',
        appointmentDate: new Date(now.getTime() + 86400000).toISOString(),
        preferredTime: '11:00 AM',
        status: 'Pending'
      }
    ],
    recentPatients: [
      { patientId: 'PAT-3001', patientName: 'Emma Tan', patientGender: 'Female', createdAt: iso },
      { patientId: 'PAT-3002', patientName: 'Alex Chua', patientGender: 'Male', createdAt: new Date(now.getTime() - 7200000).toISOString() }
    ]
  };
}
