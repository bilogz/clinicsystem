import { fetchApiData, invalidateApiCache } from '@/services/apiClient';

export type PrefectBridgeStatus = {
  integrationModel: 'push';
  /** Plain statement: list is DB-only; no Prefect HTTP reads. */
  dataSource?: string;
  explanation: string;
  ingestUrl: string;
  httpMethod: string;
  tokenConfigured: boolean;
  tokenMissingOnClinic: boolean;
  storedPrefectIncidentCount: number;
  remotePrefectNote: string;
  sharedEnvKey: string;
  clinicUiTestHint?: string;
  registrySyncPath?: string;
  registrySyncHint?: string;
};

/** GET — diagnostics only; does not pull data from Prefect. */
export async function fetchPrefectBridgeStatus(): Promise<PrefectBridgeStatus> {
  const data = await fetchApiData<PrefectBridgeStatus>('/api/integrations/prefect/incident-reports', {
    ttlMs: 0,
    forceRefresh: true
  });
  return data;
}

export type PostPrefectIngestResult = { ok: boolean; message?: string; entity_key?: string };

export type RegistrySyncResult = {
  ok: boolean;
  message?: string;
  data?: { inserted: number; skipped: number; scanned: number };
};

/**
 * While logged in as clinic admin: insert one prefect_incident row (no integration token).
 * Use this to verify DB + UI. Real Prefect traffic still uses X-Integration-Token.
 */
export async function postPrefectIncidentAdminSimulate(): Promise<PostPrefectIngestResult> {
  const res = await fetch('/api/integrations/prefect/incident-reports', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      simulate_from_clinic_admin: true,
      payload: {
        title: 'Test incident (clinic admin)',
        student_no: 'DEMO-0001',
        student_name: 'Demo Student',
        notes: 'Recorded from clinic UI to verify inbox + database (not from Prefect).',
        severity: 'Low',
        location: 'Campus (sample)'
      }
    })
  });
  const json = (await res.json()) as PostPrefectIngestResult & { message?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  invalidateApiCache('module-activity');
  return json;
}

/** Copy Prefect→Clinic rows from clinic.department_clearance_records into module_activity_logs (same Supabase). */
export async function postPrefectRegistrySync(limit = 40): Promise<RegistrySyncResult> {
  const res = await fetch('/api/integrations/prefect/sync-from-registry', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit })
  });
  const json = (await res.json()) as RegistrySyncResult;
  if (!res.ok || !json.ok) {
    throw new Error(json.message || `Sync failed (${res.status})`);
  }
  invalidateApiCache('module-activity');
  return json;
}
