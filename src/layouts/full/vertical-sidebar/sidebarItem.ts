import {
  DashboardIcon,
  CircleIcon,
  ClockIcon,
  FileExportIcon,
  SendIcon,
  TemperatureIcon,
  PhotoIcon,
  BuildingStoreIcon,
  HelpIcon,
  ArchiveIcon
} from 'vue-tabler-icons';

export interface menu {
  header?: string;
  title?: string;
  icon?: object | string;
  to?: string;
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
  { header: 'Clinic Overview' },
  {
    title: 'Dashboard',
    icon: DashboardIcon,
    to: '/dashboard/default'
  },
  { divider: true },
  { header: 'Clinic Modules' },
  {
    title: 'Appointments',
    icon: ClockIcon,
    to: '/appointments'
  },
  {
    title: 'Patients Database',
    icon: CircleIcon,
    to: '/modules/patients-database'
  },
  {
    title: 'Registration (Patient Management)',
    icon: FileExportIcon,
    to: '/modules/registration'
  },
  {
    title: 'Walk-In',
    icon: SendIcon,
    to: '/modules/walk-in'
  },
  {
    title: 'Check-Up',
    icon: TemperatureIcon,
    to: '/modules/check-up'
  },
  {
    title: 'Laboratory',
    icon: PhotoIcon,
    to: '/modules/laboratory'
  },
  {
    title: 'Pharmacy & Inventory',
    icon: BuildingStoreIcon,
    to: '/modules/pharmacy-inventory'
  },
  {
    title: 'Mental Health & Addiction',
    icon: HelpIcon,
    to: '/modules/mental-health-addiction'
  },
  {
    title: 'Reports',
    icon: ArchiveIcon,
    to: '/modules/reports'
  }
];

export default sidebarItem;
