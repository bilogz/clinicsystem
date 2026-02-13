import {
  CircleIcon,
  DashboardIcon,
  BrandChromeIcon,
  WindmillIcon,
  TypographyIcon,
  ShadowIcon,
  PaletteIcon,
  BugIcon,
  HelpIcon
} from 'vue-tabler-icons';

export interface menu {
  header?: string;
  title?: string;
  icon?: object;
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
    icon: BrandChromeIcon,
    to: '/appointments'
  },
  {
    title: 'Patients Database',
    icon: CircleIcon,
    to: '/modules/patients-database'
  },
  {
    title: 'Registration (Patient Management)',
    icon: TypographyIcon,
    to: '/modules/registration'
  },
  {
    title: 'Walk-In',
    icon: WindmillIcon,
    to: '/modules/walk-in'
  },
  {
    title: 'Check-Up',
    icon: ShadowIcon,
    to: '/modules/check-up'
  },
  {
    title: 'Laboratory',
    icon: PaletteIcon,
    to: '/modules/laboratory'
  },
  {
    title: 'Pharmacy & Inventory',
    icon: BugIcon,
    to: '/modules/pharmacy-inventory'
  },
  {
    title: 'Mental Health & Addiction',
    icon: HelpIcon,
    to: '/modules/mental-health-addiction'
  },
  {
    title: 'Reports',
    icon: CircleIcon,
    to: '/modules/reports'
  }
];

export default sidebarItem;
