import { fetchApiData, invalidateApiCache } from '@/services/apiClient';

export type CashierIntegrationQueueItem = {
  id: number;
  source_module: string;
  source_entity: string;
  source_key: string;
  patient_name: string;
  patient_type: string;
  reference_no: string;
  amount_due: number;
  currency_code: string;
  payment_status: string;
  sync_status: string;
  last_error: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CashierPaymentLink = {
  id: number;
  source_module: string;
  source_key: string;
  cashier_reference: string | null;
  invoice_number: string | null;
  official_receipt: string | null;
  amount_due: number;
  amount_paid: number;
  balance_due: number;
  payment_status: string;
  paid_at: string | null;
  updated_at: string;
};

export type CashierIntegrationStatus = {
  enabled: boolean;
  syncMode: 'queue' | 'auto';
  baseUrl: string;
  inboundPath: string;
  queue: {
    pending: number;
    sent: number;
    acknowledged: number;
    failed: number;
  };
  recentEvents: CashierIntegrationQueueItem[];
  recentPayments: CashierPaymentLink[];
};

export async function fetchCashierIntegrationStatus(): Promise<CashierIntegrationStatus> {
  const response = await fetchApiData<{ data: CashierIntegrationStatus }>('/api/integrations/cashier/status', { ttlMs: 5_000 });
  return response.data;
}

export async function fetchCashierQueue(params: { page?: number; perPage?: number; syncStatus?: string; sourceModule?: string } = {}): Promise<{
  items: CashierIntegrationQueueItem[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.perPage) query.set('per_page', String(params.perPage));
  if (params.syncStatus) query.set('sync_status', params.syncStatus);
  if (params.sourceModule) query.set('source_module', params.sourceModule);
  const suffix = query.toString();
  const response = await fetchApiData<{ data: { items: CashierIntegrationQueueItem[]; meta: { page: number; perPage: number; total: number; totalPages: number } } }>(
    `/api/integrations/cashier/queue${suffix ? `?${suffix}` : ''}`,
    { ttlMs: 3_000 }
  );
  return response.data;
}

export async function dispatchPendingCashierEvents(limit = 10): Promise<void> {
  await fetchApiData('/api/integrations/cashier/sync', {
    method: 'POST',
    body: { action: 'dispatch_pending', limit }
  });
  invalidateApiCache('/api/integrations/cashier/status');
  invalidateApiCache('/api/integrations/cashier/queue');
}

export async function updateCashierPaymentStatus(payload: Record<string, unknown>): Promise<void> {
  await fetchApiData('/api/integrations/cashier/payment-status', {
    method: 'POST',
    body: payload
  });
  invalidateApiCache('/api/integrations/cashier/status');
  invalidateApiCache('/api/integrations/cashier/queue');
  invalidateApiCache('/api/dashboard');
  invalidateApiCache('/api/reports');
}
