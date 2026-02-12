const PublicRoutes = {
  path: '/',
  component: () => import('@/layouts/blank/BlankLayout.vue'),
  meta: {
    requiresAuth: false
  },
  children: [
    {
      name: 'Patient Home',
      path: '/',
      component: () => import('@/views/patient/PatientLandingPage.vue')
    },
    {
      path: '/patient',
      redirect: '/'
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
