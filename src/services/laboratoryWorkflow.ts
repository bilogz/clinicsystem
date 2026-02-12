export type LabStatus = 'Pending' | 'In Progress' | 'Result Ready' | 'Completed' | 'Cancelled';
export type LabPriority = 'Normal' | 'Urgent' | 'STAT';

export type LabQueueFilterParams = {
  search?: string;
  status?: string;
  category?: string;
  priority?: string;
  doctor?: string;
  fromDate?: string;
  toDate?: string;
};

export type LabQueueRequest = {
  requestId: number;
  visitId: string;
  patientId: string;
  patientName: string;
  category: string;
  priority: LabPriority;
  status: LabStatus;
  requestedAt: string;
  requestedByDoctor: string;
};

export type LabRequestDetail = {
  requestId: number;
  visitId: string;
  patientId: string;
  patientName: string;
  age: number | null;
  sex: string;
  category: string;
  priority: LabPriority;
  status: LabStatus;
  requestedAt: string;
  requestedByDoctor: string;
  notes: string;
  tests: string[];
  assignedLabStaff: string;
  sampleCollected: boolean;
  sampleCollectedAt: string | null;
  processingStartedAt: string | null;
  resultEncodedAt: string | null;
  releasedAt: string | null;
  rawAttachmentName: string;
  encodedValues: Record<string, string | number | null>;
};

export type LabActivityLog = {
  id: number;
  requestId: number;
  action: string;
  details: string;
  actor: string;
  createdAt: string;
};

export type StartProcessingPayload = {
  requestId: number;
  labStaff: string;
  sampleCollected: boolean;
  sampleCollectedAt: string | null;
  processingStartedAt: string;
};

export type SaveResultsPayload = {
  requestId: number;
  summary: string;
  encodedValues: Record<string, string | number | null>;
  attachmentName: string;
  finalize: boolean;
  resultEncodedAt: string | null;
};

export type ReleaseReportPayload = {
  requestId: number;
  releasedBy: string;
  releasedAt: string;
};

type LabStore = {
  requests: LabRequestDetail[];
  logs: LabActivityLog[];
};

const LAB_STORE_KEY = 'nexora_laboratory_store_v1';

function nowIso(): string {
  return new Date().toISOString();
}

function isoAgo(daysAgo: number, hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function seedStore(): LabStore {
  const requests: LabRequestDetail[] = [
    {
      requestId: 1208,
      visitId: 'VISIT-2026-2001',
      patientId: 'PAT-3401',
      patientName: 'Maria Santos',
      age: 34,
      sex: 'Female',
      category: 'Blood Test',
      priority: 'Normal',
      status: 'Pending',
      requestedAt: isoAgo(0, 10, 45),
      requestedByDoctor: 'Dr. Humour',
      notes: 'Fatigue and dizziness for 3 days.',
      tests: ['Complete Blood Count (CBC)', 'Comprehensive Metabolic Panel (CMP)', 'Lipid Panel'],
      assignedLabStaff: 'Tech Anne',
      sampleCollected: false,
      sampleCollectedAt: null,
      processingStartedAt: null,
      resultEncodedAt: null,
      releasedAt: null,
      rawAttachmentName: '',
      encodedValues: {}
    },
    {
      requestId: 1196,
      visitId: 'VISIT-2026-1983',
      patientId: 'PAT-2977',
      patientName: 'Emma Tan',
      age: 29,
      sex: 'Female',
      category: 'Urinalysis',
      priority: 'Normal',
      status: 'In Progress',
      requestedAt: isoAgo(2, 9, 20),
      requestedByDoctor: 'Dr. Morco',
      notes: 'Dysuria and mild lower abdominal discomfort.',
      tests: ['Urinalysis Routine', 'Microscopy'],
      assignedLabStaff: 'Tech Liza',
      sampleCollected: true,
      sampleCollectedAt: isoAgo(2, 9, 45),
      processingStartedAt: isoAgo(2, 10, 0),
      resultEncodedAt: null,
      releasedAt: null,
      rawAttachmentName: 'emma-tan-urinalysis-raw.pdf',
      encodedValues: {}
    },
    {
      requestId: 1172,
      visitId: 'VISIT-2026-1948',
      patientId: 'PAT-2674',
      patientName: 'Alex Chua',
      age: 31,
      sex: 'Male',
      category: 'Blood Test',
      priority: 'Normal',
      status: 'Result Ready',
      requestedAt: isoAgo(4, 11, 30),
      requestedByDoctor: 'Dr. Jenni',
      notes: 'Routine follow-up panel before physician review.',
      tests: ['CBC', 'Fasting Blood Sugar'],
      assignedLabStaff: 'Tech Mark',
      sampleCollected: true,
      sampleCollectedAt: isoAgo(4, 11, 40),
      processingStartedAt: isoAgo(4, 11, 45),
      resultEncodedAt: isoAgo(4, 12, 10),
      releasedAt: null,
      rawAttachmentName: 'alex-chua-blood-raw.pdf',
      encodedValues: { wbc: 6.4, rbc: 4.8, hemoglobin: 14.2, platelets: 288 }
    },
    {
      requestId: 1160,
      visitId: 'VISIT-2026-1908',
      patientId: 'PAT-2509',
      patientName: 'Lara Gomez',
      age: 27,
      sex: 'Female',
      category: 'X-Ray',
      priority: 'Urgent',
      status: 'Completed',
      requestedAt: isoAgo(6, 8, 40),
      requestedByDoctor: 'Dr. Molina',
      notes: 'Follow-up chest imaging.',
      tests: ['Chest X-Ray (PA View)'],
      assignedLabStaff: 'Tech Paolo',
      sampleCollected: true,
      sampleCollectedAt: isoAgo(6, 8, 50),
      processingStartedAt: isoAgo(6, 9, 5),
      resultEncodedAt: isoAgo(6, 9, 35),
      releasedAt: isoAgo(6, 10, 5),
      rawAttachmentName: 'lara-gomez-xray.jpg',
      encodedValues: { examined_area: 'Chest', radiology_findings: 'No acute infiltrates', impression: 'Normal chest X-ray' }
    }
  ];

  const logs: LabActivityLog[] = [
    {
      id: 1,
      requestId: 1208,
      action: 'Request Created',
      details: 'Doctor submitted a new laboratory request.',
      actor: 'Dr. Humour',
      createdAt: isoAgo(0, 10, 45)
    },
    {
      id: 2,
      requestId: 1196,
      action: 'Processing Started',
      details: 'Sample collected and moved to processing queue.',
      actor: 'Tech Liza',
      createdAt: isoAgo(2, 10, 0)
    }
  ];

  return { requests, logs };
}

function readStore(): LabStore {
  try {
    const raw = localStorage.getItem(LAB_STORE_KEY);
    if (!raw) {
      const seeded = seedStore();
      localStorage.setItem(LAB_STORE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as LabStore;
  } catch {
    const seeded = seedStore();
    localStorage.setItem(LAB_STORE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function writeStore(store: LabStore): void {
  localStorage.setItem(LAB_STORE_KEY, JSON.stringify(store));
}

function toQueueItem(item: LabRequestDetail): LabQueueRequest {
  return {
    requestId: item.requestId,
    visitId: item.visitId,
    patientId: item.patientId,
    patientName: item.patientName,
    category: item.category,
    priority: item.priority,
    status: item.status,
    requestedAt: item.requestedAt,
    requestedByDoctor: item.requestedByDoctor
  };
}

function addLog(store: LabStore, requestId: number, action: string, details: string, actor: string): void {
  const nextId = store.logs.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  store.logs.unshift({
    id: nextId,
    requestId,
    action,
    details,
    actor,
    createdAt: nowIso()
  });
}

function updateRequest(requestId: number, updater: (item: LabRequestDetail) => LabRequestDetail): LabRequestDetail | null {
  const store = readStore();
  const idx = store.requests.findIndex((item) => item.requestId === requestId);
  if (idx < 0) return null;
  store.requests[idx] = updater(store.requests[idx]);
  writeStore(store);
  return store.requests[idx];
}

export async function fetchLabQueue(params: LabQueueFilterParams = {}): Promise<LabQueueRequest[]> {
  const store = readStore();
  const q = (params.search || '').trim().toLowerCase();
  const status = (params.status || '').trim().toLowerCase();
  const category = (params.category || '').trim().toLowerCase();
  const priority = (params.priority || '').trim().toLowerCase();
  const doctor = (params.doctor || '').trim().toLowerCase();

  return store.requests
    .filter((item) => {
      if (status && status !== 'all') {
        if (status === 'in_progress') {
          if (!(item.status === 'In Progress' || item.status === 'Result Ready')) return false;
        } else if (status === 'completed') {
          if (item.status !== 'Completed') return false;
        } else if (status === 'pending') {
          if (item.status !== 'Pending') return false;
        }
      }

      if (category && category !== 'all' && item.category.toLowerCase() !== category) return false;
      if (priority && priority !== 'all' && item.priority.toLowerCase() !== priority) return false;
      if (doctor && doctor !== 'all' && item.requestedByDoctor.toLowerCase() !== doctor) return false;
      if (!q) return true;

      const target = `${item.requestId} ${item.visitId} ${item.patientId} ${item.patientName} ${item.category} ${item.priority} ${item.status} ${item.requestedByDoctor}`.toLowerCase();
      return target.includes(q);
    })
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
    .map(toQueueItem);
}

export async function fetchLabRequest(requestId: number): Promise<LabRequestDetail> {
  const store = readStore();
  const item = store.requests.find((entry) => entry.requestId === requestId);
  if (!item) {
    throw 'Laboratory request not found.';
  }
  return { ...item };
}

export async function fetchLabActivity(requestId: number): Promise<LabActivityLog[]> {
  const store = readStore();
  return store.logs.filter((item) => item.requestId === requestId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function startLabProcessing(payload: StartProcessingPayload): Promise<LabRequestDetail | null> {
  const store = readStore();
  const idx = store.requests.findIndex((item) => item.requestId === payload.requestId);
  if (idx < 0) return null;

  store.requests[idx] = {
    ...store.requests[idx],
    status: 'In Progress',
    assignedLabStaff: payload.labStaff || store.requests[idx].assignedLabStaff,
    sampleCollected: payload.sampleCollected,
    sampleCollectedAt: payload.sampleCollected ? payload.sampleCollectedAt || nowIso() : null,
    processingStartedAt: payload.processingStartedAt || nowIso()
  };

  addLog(store, payload.requestId, 'Processing Started', 'Sample collected and processing started.', payload.labStaff || 'Lab Staff');
  writeStore(store);
  return { ...store.requests[idx] };
}

export async function saveLabResults(payload: SaveResultsPayload): Promise<LabRequestDetail | null> {
  const store = readStore();
  const idx = store.requests.findIndex((item) => item.requestId === payload.requestId);
  if (idx < 0) return null;

  const current = store.requests[idx];
  const nextStatus: LabStatus = payload.finalize ? 'Result Ready' : 'In Progress';
  const nextEncodedAt = payload.finalize ? payload.resultEncodedAt || nowIso() : current.resultEncodedAt;

  store.requests[idx] = {
    ...current,
    status: nextStatus,
    rawAttachmentName: payload.attachmentName || current.rawAttachmentName,
    encodedValues: { ...payload.encodedValues },
    resultEncodedAt: nextEncodedAt
  };

  addLog(
    store,
    payload.requestId,
    payload.finalize ? 'Result Finalized' : 'Draft Saved',
    payload.summary || (payload.finalize ? 'Result is now ready for release.' : 'Encoded result draft saved.'),
    current.assignedLabStaff || 'Lab Staff'
  );
  writeStore(store);
  return { ...store.requests[idx] };
}

export async function releaseLabReport(payload: ReleaseReportPayload): Promise<LabRequestDetail | null> {
  const store = readStore();
  const idx = store.requests.findIndex((item) => item.requestId === payload.requestId);
  if (idx < 0) return null;
  const current = store.requests[idx];
  if (current.status !== 'Result Ready') return null;

  store.requests[idx] = {
    ...current,
    status: 'Completed',
    releasedAt: payload.releasedAt || nowIso()
  };

  addLog(store, payload.requestId, 'Report Released', 'Lab report released to doctor/check-up.', payload.releasedBy || 'Lab Staff');
  writeStore(store);
  return { ...store.requests[idx] };
}
