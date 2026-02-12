import { defineStore } from 'pinia';
import { router } from '@/router';

type AuthUser = {
  id: number;
  username: string;
  fullName: string;
  email?: string;
  role: string;
  avatar?: string;
  unreadNotifications?: number;
  token: string;
};

type AuthState = {
  user: AuthUser | null;
  returnUrl: string | null;
};

const LOCAL_USER_KEY = 'user';

const MOCK_ADMIN: AuthUser = {
  id: 1,
  username: 'joecelgarcia1@gmail.com',
  fullName: 'Nexora Admin',
  email: 'joecelgarcia1@gmail.com',
  role: 'Admin',
  avatar: '',
  unreadNotifications: 3,
  token: 'local-admin-token'
};

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
    async login(username: string, password: string) {
      const loginValue = username.trim().toLowerCase();

      if (loginValue !== MOCK_ADMIN.username.toLowerCase() || password !== 'Admin#123') {
        throw 'Invalid credentials.';
      }

      this.user = {
        ...MOCK_ADMIN,
        username: username.trim(),
        email: username.trim()
      };

      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(this.user));
      router.push(this.returnUrl || '/dashboard/default');
    },

    async logout() {
      this.user = null;
      localStorage.removeItem(LOCAL_USER_KEY);
      router.push('/admin/login');
    }
  }
});
