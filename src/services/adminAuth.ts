export type AdminUser = {
  id: number;
  username: string;
  fullName: string;
  email?: string;
  role: string;
  isSuperAdmin: boolean;
  avatar?: string;
  unreadNotifications?: number;
  token: string;
};

type AdminSessionResponse = {
  authenticated: boolean;
  user: Omit<AdminUser, 'token' | 'avatar' | 'unreadNotifications'> | null;
};

type ApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
};

type CreateAdminAccountPayload = {
  username: string;
  email: string;
  full_name: string;
  password: string;
  role: string;
  phone?: string;
  status?: string;
  is_super_admin?: boolean;
};

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  let payload: ApiResponse<T> = { ok: false };
  if (text) {
    try {
      payload = JSON.parse(text) as ApiResponse<T>;
    } catch {
      payload = { ok: false, message: text };
    }
  }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || `Request failed (${response.status})`);
  }
  return payload;
}

function withClientFields(user: NonNullable<AdminSessionResponse['user']>): AdminUser {
  return {
    ...user,
    token: 'server-session',
    unreadNotifications: 3
  };
}

export async function fetchAdminSession(): Promise<AdminUser | null> {
  const response = await fetch('/api/admin-auth', { credentials: 'include' });
  const parsed = await parseResponse<AdminSessionResponse>(response);
  if (!parsed.data?.authenticated || !parsed.data.user) return null;
  return withClientFields(parsed.data.user);
}

export async function loginAdmin(username: string, password: string): Promise<AdminUser> {
  const response = await fetch('/api/admin-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action: 'login', username, password })
  });
  const parsed = await parseResponse<{ user: NonNullable<AdminSessionResponse['user']> }>(response);
  return withClientFields(parsed.data!.user);
}

export async function logoutAdmin(): Promise<void> {
  await fetch('/api/admin-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action: 'logout' })
  });
}

export async function createAdminAccount(payload: CreateAdminAccountPayload): Promise<void> {
  const response = await fetch('/api/admin-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      action: 'create_account',
      ...payload
    })
  });
  await parseResponse<unknown>(response);
}
