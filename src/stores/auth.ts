import { defineStore } from 'pinia';
import { router } from '@/router';
import { createAdminAccount, fetchAdminSession, loginAdmin, logoutAdmin, type AdminUser } from '@/services/adminAuth';

type AuthUser = AdminUser;

type AuthState = {
  user: AuthUser | null;
  returnUrl: string | null;
};

const LOCAL_USER_KEY = 'user';

function readLocalUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore({
  id: 'auth',
  state: (): AuthState => ({
    user: readLocalUser(),
    returnUrl: null
  }),
  actions: {
    async hydrateSession(force = false) {
      if (this.user && !force) return this.user;
      try {
        const sessionUser = await fetchAdminSession();
        this.user = sessionUser;
      } catch {
        this.user = null;
      }
      if (this.user) localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(this.user));
      else localStorage.removeItem(LOCAL_USER_KEY);
      return this.user;
    },

    async login(username: string, password: string) {
      this.user = await loginAdmin(username.trim(), password);
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(this.user));
      router.push(this.returnUrl || '/dashboard/default');
    },

    async logout() {
      try {
        await logoutAdmin();
      } catch {
        // keep local logout behavior
      }
      this.user = null;
      localStorage.removeItem(LOCAL_USER_KEY);
      router.push('/admin/login');
    },

    async registerAdminAccount(payload: {
      username: string;
      email: string;
      full_name: string;
      password: string;
      role: string;
      phone?: string;
      status?: string;
      is_super_admin?: boolean;
    }) {
      if (!this.user?.isSuperAdmin) {
        throw new Error('Only super admin can create admin accounts.');
      }
      await createAdminAccount(payload);
    }
  }
});
