export type AdminActivityLog = {
  dateTime: string;
  action: string;
  rawAction: string;
  description: string;
  ipAddress: string;
};

export type AdminProfileData = {
  fullName: string;
  username: string;
  email: string;
  role: string;
  status: string;
  phone: string;
  createdAt: string;
  lastLoginAt: string;
};

export type AdminProfilePreferences = {
  emailNotifications: boolean;
  inAppNotifications: boolean;
  darkMode: boolean;
};

export type AdminProfilePayload = {
  profile: AdminProfileData;
  preferences: AdminProfilePreferences;
  stats: {
    totalLogins: number;
    status: string;
  };
  activityLogs: AdminActivityLog[];
  loginHistory: AdminActivityLog[];
};

type UpdateProfileRequest = {
  fullName: string;
  phone: string;
  preferences: AdminProfilePreferences;
};

const STORAGE_KEY = 'nexora_admin_profile_payload';

function nowIso(): string {
  return new Date().toISOString();
}

function seedPayload(): AdminProfilePayload {
  const now = nowIso();
  return {
    profile: {
      fullName: 'Nexora Admin',
      username: 'joecelgarcia1@gmail.com',
      email: 'joecelgarcia1@gmail.com',
      role: 'admin',
      status: 'active',
      phone: '+63 912 345 6789',
      createdAt: '2026-01-11T08:20:00.000Z',
      lastLoginAt: now
    },
    preferences: {
      emailNotifications: true,
      inAppNotifications: true,
      darkMode: false
    },
    stats: {
      totalLogins: 18,
      status: 'ACTIVE'
    },
    activityLogs: [
      {
        dateTime: now,
        action: 'Login',
        rawAction: 'LOGIN',
        description: 'Admin logged in (local mode).',
        ipAddress: '127.0.0.1'
      }
    ],
    loginHistory: [
      {
        dateTime: now,
        action: 'Login',
        rawAction: 'LOGIN',
        description: 'Admin logged in (local mode).',
        ipAddress: '127.0.0.1'
      }
    ]
  };
}

function readPayload(): AdminProfilePayload {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedPayload();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as AdminProfilePayload;
  } catch {
    const seeded = seedPayload();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function writePayload(payload: AdminProfilePayload): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function prependLog(payload: AdminProfilePayload, log: AdminActivityLog): AdminProfilePayload {
  const nextActivity = [log, ...payload.activityLogs].slice(0, 50);
  const nextLoginHistory =
    log.rawAction === 'LOGIN' || log.rawAction === 'LOGOUT' ? [log, ...payload.loginHistory].slice(0, 50) : payload.loginHistory;

  return {
    ...payload,
    activityLogs: nextActivity,
    loginHistory: nextLoginHistory
  };
}

export async function fetchAdminProfile(): Promise<AdminProfilePayload> {
  return readPayload();
}

export async function updateAdminProfile(payload: UpdateProfileRequest): Promise<AdminProfilePayload> {
  const existing = readPayload();
  const updated: AdminProfilePayload = {
    ...existing,
    profile: {
      ...existing.profile,
      fullName: payload.fullName.trim() || existing.profile.fullName,
      phone: payload.phone.trim(),
      lastLoginAt: existing.profile.lastLoginAt
    },
    preferences: {
      ...existing.preferences,
      ...payload.preferences
    }
  };

  const withLog = prependLog(updated, {
    dateTime: nowIso(),
    action: 'Profile Updated',
    rawAction: 'PROFILE_UPDATED',
    description: 'Profile settings updated (local mode).',
    ipAddress: '127.0.0.1'
  });

  writePayload(withLog);
  return withLog;
}
