import {
  mdiAccountGroupOutline,
  mdiAccountHeartOutline,
  mdiAccountOutline,
  mdiAccountMultipleOutline,
  mdiAccountSwitchOutline,
  mdiCogOutline,
  mdiCalendarClockOutline,
  mdiChartLine,
  mdiClipboardTextOutline,
  mdiFlaskOutline,
  mdiLogout,
  mdiPill,
  mdiShieldAccountOutline,
  mdiStethoscope,
  mdiViewDashboardOutline,
  mdiWalk
} from '@mdi/js';

export interface menu {
  header?: string;
  title?: string;
  icon?: object | string;
  to?: string;
  action?: string;
  divider?: boolean;
  chip?: string;
  chipColor?: string;
  chipVariant?: string;
  chipIcon?: string;
  children?: menu[];
  disabled?: boolean;
  type?: string;
  subCaption?: string;
}

const sidebarItem: menu[] = [
  { header: 'Clinic System' },
  {
    title: 'Dashboard',
    icon: mdiViewDashboardOutline,
    to: '/dashboard/default'
  },
  { divider: true },
  { header: 'Appointment Workflow' },
  {
    title: 'Appointments',
    icon: mdiCalendarClockOutline,
    to: '/appointments'
  },
  {
    title: 'Patients Database',
    icon: mdiAccountGroupOutline,
    to: '/modules/patients'
  },
  {
    title: 'Registration (Patient Management)',
    icon: mdiClipboardTextOutline,
    to: '/modules/registration'
  },
  {
    title: 'Walk-In',
    icon: mdiWalk,
    to: '/modules/walk-in'
  },
  {
    title: 'Check-Up',
    icon: mdiStethoscope,
    to: '/modules/check-up'
  },
  {
    title: 'Laboratory',
    icon: mdiFlaskOutline,
    to: '/modules/laboratory'
  },
  {
    title: 'Pharmacy & Inventory',
    icon: mdiPill,
    to: '/modules/pharmacy'
  },
  {
    title: 'Mental Health & Addiction',
    icon: mdiAccountHeartOutline,
    to: '/modules/mental-health'
  },
  {
    title: 'Reports',
    icon: mdiChartLine,
    to: '/modules/reports'
  },
  { divider: true },
  { header: 'Integration' },
  {
    title: 'Request Doctor/Nurse',
    icon: mdiAccountSwitchOutline,
    to: '/modules/hr-staff-request'
  },
  {
    title: 'Prefect incident reports',
    icon: mdiShieldAccountOutline,
    to: '/modules/prefect-incidents'
  },
  {
    title: 'Doctors/Nurse',
    icon: mdiAccountMultipleOutline,
    to: '/modules/doctors-nurse'
  },
  { divider: true },
  { header: 'Account' },
  {
    title: 'My Profile',
    icon: mdiAccountOutline,
    to: '/profile'
  },
  {
    title: 'Settings',
    icon: mdiCogOutline,
    to: '/profile?tab=preferences'
  },
  {
    title: 'Logout',
    icon: mdiLogout,
    action: 'logout'
  }
];

export default sidebarItem;
