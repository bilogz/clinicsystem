const MainRoutes = {
  path: '/main',
  meta: {
    requiresAuth: true
  },
  redirect: '/dashboard/default',
  component: () => import('@/layouts/full/FullLayout.vue'),
  children: [
    {
      name: 'Default',
      path: '/dashboard/default',
      component: () => import('@/views/dashboards/default/DefaultDashboard.vue')
    },
    {
      name: 'My Profile',
      path: '/profile',
      component: () => import('@/views/profile/MyProfilePage.vue')
    },
    {
      name: 'Appointments',
      path: '/appointments',
      component: () => import('@/views/appointments/AppointmentsPage.vue')
    },
    {
      name: 'Registration',
      path: '/modules/registration',
      component: () => import('@/views/admin/modules/RegistrationPage.vue')
    },
    {
      name: 'Walk-In',
      path: '/modules/walk-in',
      component: () => import('@/views/admin/modules/WalkInPage.vue')
    },
    {
      name: 'Check-Up',
      path: '/modules/check-up',
      component: () => import('@/views/admin/modules/CheckUpPage.vue')
    },
    {
      name: 'Laboratory',
      path: '/modules/laboratory',
      component: () => import('@/views/admin/modules/LaboratoryPage.vue')
    },
    {
      name: 'Pharmacy & Inventory',
      path: '/modules/pharmacy-inventory',
      component: () => import('@/views/admin/modules/PharmacyInventoryPage.vue')
    },
    {
      name: 'Mental Health & Addiction',
      path: '/modules/mental-health-addiction',
      component: () => import('@/views/admin/modules/MentalHealthAddictionPage.vue')
    },
    {
      name: 'Reports',
      path: '/modules/reports',
      component: () => import('@/views/StarterPage.vue')
    },
    {
      name: 'Starter',
      path: '/starter',
      component: () => import('@/views/StarterPage.vue')
    },
    {
      name: 'Tabler Icons',
      path: '/icons/tabler',
      component: () => import('@/views/utilities/icons/TablerIcons.vue')
    },
    {
      name: 'Material Icons',
      path: '/icons/material',
      component: () => import('@/views/utilities/icons/MaterialIcons.vue')
    },
    {
      name: 'Typography',
      path: '/utils/typography',
      component: () => import('@/views/utilities/typography/TypographyPage.vue')
    },
    {
      name: 'Shadows',
      path: '/utils/shadows',
      component: () => import('@/views/utilities/shadows/ShadowPage.vue')
    },
    {
      name: 'Colors',
      path: '/utils/colors',
      component: () => import('@/views/utilities/colors/ColorPage.vue')
    }
  ]
};

export default MainRoutes;
