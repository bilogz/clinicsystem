import { fetchApiData, invalidateApiCache } from '@/services/apiClient';

export type AdminUser = {
  id: number;
  username: string;
  fullName: string;
  email?: string;
  role: string;
  department?: string;
  accessExemptions?: string[];
  isSuperAdmin: boolean;
  avatar?: string;
  unreadNotifications?: number;
  token: string;
};

type AdminSessionResponse = {
  authenticated: boolean;
  user: Omit<AdminUser, 'token' | 'avatar' | 'unreadNotifications'> | null;
};

type CreateAdminAccountPayload = {
  username: string;
  email: string;
  full_name: string;
  password: string;
  role: string;
  department?: string;
  access_exemptions?: string[];
  phone?: string;
  status?: string;
  is_super_admin?: boolean;
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveApiUrl(): string {
  const directApi = import.meta.env.VITE_ADMIN_AUTH_API_URL?.trim();
  if (directApi) return trimTrailingSlashes(directApi);
  const configured = import.meta.env.VITE_BACKEND_API_BASE_URL?.trim();
  if (configured) return `${trimTrailingSlashes(configured)}/admin-auth`;
  return '/api/admin-auth';
}

function withClientFields(user: NonNullable<AdminSessionResponse['user']>): AdminUser {
  return {
    ...user,
    token: 'server-session',
    unreadNotifications: 3
  };
}

export async function fetchAdminSession(): Promise<AdminUser | null> {
  const data = await fetchApiData<AdminSessionResponse>(resolveApiUrl(), { ttlMs: 5_000 });
  if (!data?.authenticated || !data.user) return null;
  return withClientFields(data.user);
}

export async function loginAdmin(username: string, password: string): Promise<AdminUser> {
  const data = await fetchApiData<{ user: NonNullable<AdminSessionResponse['user']> }>(resolveApiUrl(), {
    method: 'POST',
    body: { action: 'login', username, password }
  });
  invalidateApiCache('/api/admin-auth');
  invalidateApiCache('/api/admin-profile');
  return withClientFields(data.user);
}

export async function logoutAdmin(): Promise<void> {
  await fetchApiData<unknown>(resolveApiUrl(), {
    method: 'POST',
    body: { action: 'logout' }
  });
  invalidateApiCache('/api/admin-auth');
  invalidateApiCache('/api/admin-profile');
}

export async function createAdminAccount(payload: CreateAdminAccountPayload): Promise<void> {
  await fetchApiData<unknown>(resolveApiUrl(), {
    method: 'POST',
    body: {
      action: 'create_account',
      ...payload
    }
  });
  invalidateApiCache('/api/admin-auth');
}
