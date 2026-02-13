const PublicRoutes = {
  path: '/',
  component: () => import('@/layouts/blank/BlankLayout.vue'),
  meta: {
    requiresAuth: false
  },
  children: [
    {
      name: 'Patient Home',
      path: '/patient/',
      component: () => import('@/views/patient/pages/PatientBookingPage.vue')
    },
    {
      name: 'Patient Booking',
      path: '/patient/booking',
      component: () => import('@/views/patient/pages/PatientBookingPage.vue')
    },
    {
      path: '/',
      redirect: '/patient/'
    },
    {
      path: '/patient',
      redirect: '/patient/booking'
    },
    {
      path: '/admin',
      redirect: '/patient/'
    },
    {
      path: '/admin/:pathMatch(.*)*',
      redirect: (to: any) => {
        const raw = Array.isArray(to.params.pathMatch) ? to.params.pathMatch.join('/') : String(to.params.pathMatch || '');
        const normalized = raw.replace(/^\/+|\/+$/g, '');
        if (!normalized) return '/admin/login';
        if (normalized === 'login' || normalized === 'login1' || normalized === 'register') return `/admin/${normalized}`;
        return `/${normalized}`;
      }
    },
    {
      name: 'Admin Login',
      path: '/admin/login',
      component: () => import('@/views/admin/auth/LoginPage.vue')
    },
    {
      name: 'Admin Login Alt',
      path: '/admin/login1',
      component: () => import('@/views/admin/auth/LoginAltPage.vue')
    },
    {
      name: 'Admin Register',
      path: '/admin/register',
      component: () => import('@/views/admin/auth/RegisterPage.vue')
    },
    {
      path: '/login',
      redirect: '/admin/login'
    },
    {
      path: '/login1',
      redirect: '/admin/login1'
    },
    {
      path: '/register',
      redirect: '/admin/register'
    },
    {
      name: 'Error 404',
      path: '/error',
      component: () => import('@/views/pages/maintenance/error/Error404Page.vue')
    }
  ]
};

export default PublicRoutes;
