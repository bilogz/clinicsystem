import { createRouter, createWebHistory } from 'vue-router';
import MainRoutes from './MainRoutes';
import PublicRoutes from './PublicRoutes';
import { useAuthStore } from '@/stores/auth';

function resolveRuntimeBase(): string {
  if (typeof window === 'undefined') {
    return '/admin/';
  }

  const path = window.location.pathname;
  const marker = '/admin/';
  const markerIndex = path.toLowerCase().indexOf(marker);
  if (markerIndex >= 0) {
    return path.slice(0, markerIndex + marker.length);
  }

  return '/admin/';
}

export const router = createRouter({
  history: createWebHistory(resolveRuntimeBase()),
  routes: [
    {
      path: '/:pathMatch(.*)*',
      component: () => import('@/views/pages/maintenance/error/Error404Page.vue')
    },
    MainRoutes,
    PublicRoutes
  ]
});

router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore();
  const authRequired = to.matched.some((record) => record.meta.requiresAuth);
  const isAdminAuthPage = ['/admin/login', '/admin/login1', '/admin/register', '/login', '/login1', '/register'].includes(to.path);

  if (authRequired && !auth.user) {
    auth.returnUrl = to.fullPath;
    next('/admin/login');
    return;
  }

  if (auth.user && isAdminAuthPage) {
    next(auth.returnUrl || '/dashboard/default');
    return;
  }

  next();
});
