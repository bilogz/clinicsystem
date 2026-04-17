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

const LOCAL_ADMIN_STORAGE_KEY = 'user';
const LOCAL_FALLBACK_USERNAME = 'joecelgarcia1@gmail.com';
const LOCAL_FALLBACK_PASSWORD = 'Admin#123';

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

function buildLocalFallbackUser(): AdminUser {
  return {
    id: 1,
    username: LOCAL_FALLBACK_USERNAME,
    fullName: 'BCP Clinic Admin',
    email: LOCAL_FALLBACK_USERNAME,
    role: 'admin',
    department: 'Administration',
    accessExemptions: [],
    isSuperAdmin: true,
    token: 'local-fallback-session',
    unreadNotifications: 3
  };
}

function readLocalFallbackUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(LOCAL_ADMIN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

function isBackendUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /html instead of json|request failed \(404\)|failed to fetch|networkerror|load failed/i.test(message);
}

function withClientFields(user: NonNullable<AdminSessionResponse['user']>): AdminUser {
  return {
    ...user,
    token: 'server-session',
    unreadNotifications: 3
  };
}

export async function fetchAdminSession(): Promise<AdminUser | null> {
  try {
    const data = await fetchApiData<AdminSessionResponse>(resolveApiUrl(), { ttlMs: 5_000 });
    if (!data?.authenticated || !data.user) return null;
    return withClientFields(data.user);
  } catch (error) {
    if (isBackendUnavailableError(error)) {
      return readLocalFallbackUser();
    }
    throw error;
  }
}

export async function loginAdmin(username: string, password: string): Promise<AdminUser> {
  try {
    const data = await fetchApiData<{ user: NonNullable<AdminSessionResponse['user']> }>(resolveApiUrl(), {
      method: 'POST',
      body: { action: 'login', username, password }
    });
    invalidateApiCache('/api/admin-auth');
    invalidateApiCache('/api/admin-profile');
    return withClientFields(data.user);
  } catch (error) {
    if (
      isBackendUnavailableError(error) &&
      username.trim().toLowerCase() === LOCAL_FALLBACK_USERNAME &&
      password === LOCAL_FALLBACK_PASSWORD
    ) {
      return buildLocalFallbackUser();
    }
    throw error;
  }
}

export async function logoutAdmin(): Promise<void> {
  try {
    await fetchApiData<unknown>(resolveApiUrl(), {
      method: 'POST',
      body: { action: 'logout' }
    });
  } catch (error) {
    if (!isBackendUnavailableError(error)) {
      throw error;
    }
  }
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
