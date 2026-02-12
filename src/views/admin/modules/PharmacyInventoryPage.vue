<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

type StockState = 'Healthy' | 'Low' | 'Out of Stock';
type QuickFilter = 'all' | 'out' | 'low' | 'healthy' | 'expiring';
type SortKey = 'name' | 'stock' | 'type' | 'expiry';
type SortDirection = 'asc' | 'desc';
type ActionType = 'add' | 'edit' | 'archive' | 'restock' | 'dispense' | 'fulfill';
type DispenseStatus = 'Pending' | 'Fulfilled';

type Medicine = {
  id: number;
  name: string;
  category: string;
  type: string;
  stock: number;
  capacity: number;
  lowThreshold: number;
  expiryDate: string;
  unit: string;
};

type DispenseRequest = {
  id: number;
  patientName: string;
  medicineName: string;
  quantity: number;
  notes: string;
  requestedAt: string;
  status: DispenseStatus;
};

type InventoryLog = {
  id: number;
  detail: string;
  actor: string;
  at: string;
  tone: 'success' | 'warning' | 'info';
};

type StockHistoryEntry = {
  id: number;
  event: string;
  by: string;
  at: string;
  detail: string;
};

const pageLoading = ref(true);
const pageReady = ref(false);

const searchQuery = ref('');
const categoryFilter = ref('All Categories');
const stockFilter = ref<'All' | StockState>('All');
const quickFilter = ref<QuickFilter>('all');
const sortBy = ref<SortKey>('stock');
const sortDirection = ref<SortDirection>('asc');
const listPage = ref(1);
const pageSize = ref(6);
const pageSizeOptions = [6, 10, 20];
const selectedMedicineId = ref<number | null>(null);
const historyDrawer = ref(false);
const historyMedicineId = ref<number | null>(null);

const alertsDialog = ref(false);
const selectedMedicineDialog = ref(false);
const actionDialog = ref(false);
const actionType = ref<ActionType>('restock');
const actionLoading = ref(false);
const actionMedicineId = ref<number | null>(null);
const actionRequest = ref<DispenseRequest | null>(null);

const snackbar = ref(false);
const snackbarText = ref('');
const snackbarColor = ref<'success' | 'info' | 'warning' | 'error'>('success');

const medicines = ref<Medicine[]>([
  {
    id: 43,
    name: 'Omeprazole',
    category: 'Capsule',
    type: 'Antacid',
    stock: 23,
    capacity: 200,
    lowThreshold: 30,
    expiryDate: 'May 1, 2026',
    unit: 'caps'
  },
  {
    id: 36,
    name: 'Metformin',
    category: 'Tablet',
    type: 'Diabetes',
    stock: 0,
    capacity: 150,
    lowThreshold: 35,
    expiryDate: 'Nov 22, 2026',
    unit: 'tabs'
  },
  {
    id: 31,
    name: 'Clopidogrel',
    category: 'Tablet',
    type: 'Cardio',
    stock: 20,
    capacity: 100,
    lowThreshold: 25,
    expiryDate: 'Mar 5, 2026',
    unit: 'tabs'
  },
  {
    id: 28,
    name: 'Apixaban',
    category: 'Tablet',
    type: 'Cardio',
    stock: 0,
    capacity: 75,
    lowThreshold: 20,
    expiryDate: 'Jun 18, 2026',
    unit: 'tabs'
  },
  {
    id: 24,
    name: 'Aleve',
    category: 'Tablet',
    type: 'Painkiller',
    stock: 180,
    capacity: 300,
    lowThreshold: 50,
    expiryDate: 'May 20, 2026',
    unit: 'tabs'
  },
  {
    id: 17,
    name: 'Amlodipine',
    category: 'Tablet',
    type: 'Antihypertensive',
    stock: 150,
    capacity: 300,
    lowThreshold: 60,
    expiryDate: 'Feb 7, 2027',
    unit: 'tabs'
  }
]);

const dispenseRequests = ref<DispenseRequest[]>([
  {
    id: 901,
    patientName: 'John Doe',
    medicineName: 'Omeprazole',
    quantity: 5,
    notes: 'Before breakfast',
    requestedAt: '10:43 AM',
    status: 'Pending'
  },
  {
    id: 902,
    patientName: 'Emma Tan',
    medicineName: 'Metformin',
    quantity: 10,
    notes: 'After meals',
    requestedAt: '9:18 AM',
    status: 'Pending'
  },
  {
    id: 903,
    patientName: 'Rico Dela Cruz',
    medicineName: 'Aleve',
    quantity: 3,
    notes: 'Pain management',
    requestedAt: '8:51 AM',
    status: 'Fulfilled'
  }
]);

const inventoryLogs = ref<InventoryLog[]>([
  { id: 1, detail: 'Aleve restocked +150', actor: 'Gina Marquez', at: '10:43 AM', tone: 'success' },
  { id: 2, detail: 'Omeprazole dispensed -5', actor: 'Nurse Carla', at: '9:01 AM', tone: 'info' },
  { id: 3, detail: 'Apixaban out-of-stock alert triggered', actor: 'System', at: '8:15 AM', tone: 'warning' }
]);

const stockHistory = ref<Record<number, StockHistoryEntry[]>>({
  43: [
    { id: 1, event: 'Restock', by: 'Gina Marquez', at: '10:43 AM', detail: '+80 caps (Batch OMP-52)' },
    { id: 2, event: 'Dispense', by: 'Nurse Carla', at: '9:01 AM', detail: '-5 caps for John Doe' }
  ],
  36: [
    { id: 1, event: 'Dispense', by: 'Nurse Carla', at: '9:18 AM', detail: '-10 tabs for Emma Tan' },
    { id: 2, event: 'Alert', by: 'System', at: '8:36 AM', detail: 'Out of stock threshold reached' }
  ],
  31: [{ id: 1, event: 'Alert', by: 'System', at: '8:40 AM', detail: 'Expiring soon in 30 days' }],
  28: [{ id: 1, event: 'Alert', by: 'System', at: '8:15 AM', detail: 'Out of stock threshold reached' }],
  24: [{ id: 1, event: 'Restock', by: 'Gina Marquez', at: '10:43 AM', detail: '+150 tabs (Batch ALV-27)' }],
  17: [{ id: 1, event: 'Dispense', by: 'Nurse Carla', at: '7:52 AM', detail: '-4 tabs for OPD queue' }]
});

const addForm = reactive({
  name: '',
  category: 'Tablet',
  type: '',
  capacity: 100,
  stock: 100,
  lowThreshold: 25,
  expiryDate: '',
  unit: 'tabs'
});

const restockForm = reactive({
  quantity: 20,
  batchNo: '',
  batchExpiry: ''
});

const dispenseForm = reactive({
  patientName: '',
  quantity: 1,
  notes: ''
});

const editForm = reactive({
  type: '',
  category: 'Tablet',
  lowThreshold: 20,
  capacity: 100,
  expiryDate: ''
});

const categoryItems = computed(() => ['All Categories', ...new Set(medicines.value.map((item) => item.category))]);

onMounted(() => {
  setTimeout(() => {
    pageLoading.value = false;
    requestAnimationFrame(() => {
      pageReady.value = true;
      selectedMedicineId.value = medicines.value[0]?.id ?? null;
    });
  }, 700);
});

function stockState(item: Medicine): StockState {
  if (item.stock <= 0) return 'Out of Stock';
  if (item.stock <= item.lowThreshold) return 'Low';
  return 'Healthy';
}

function stockPercent(item: Medicine): number {
  if (item.capacity <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((item.stock / item.capacity) * 100)));
}

function expiryDateValue(item: Medicine): number {
  const value = new Date(item.expiryDate).getTime();
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function daysUntilExpiry(item: Medicine): number {
  const today = new Date();
  const expiry = new Date(expiryDateValue(item));
  const diffMs = expiry.setHours(23, 59, 59, 999) - today.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function expiryState(item: Medicine): 'Expired' | 'Expiring Soon' | 'Safe' {
  const days = daysUntilExpiry(item);
  if (days < 0) return 'Expired';
  if (days <= 30) return 'Expiring Soon';
  return 'Safe';
}

function expiryStateColor(state: 'Expired' | 'Expiring Soon' | 'Safe'): string {
  if (state === 'Expired') return 'error';
  if (state === 'Expiring Soon') return 'warning';
  return 'success';
}

function stockToneByPercent(percent: number): string {
  if (percent <= 0) return '#ef4444';
  if (percent < 20) return '#f97316';
  if (percent < 40) return '#eab308';
  return '#22c55e';
}

const totals = computed(() => {
  const total = medicines.value.length;
  const low = medicines.value.filter((item) => stockState(item) === 'Low').length;
  const out = medicines.value.filter((item) => stockState(item) === 'Out of Stock').length;
  const pending = dispenseRequests.value.filter((req) => req.status === 'Pending').length;
  return { total, low, out, pending };
});

const lowStockList = computed(() => medicines.value.filter((item) => stockState(item) !== 'Healthy'));

const summaryAlerts = computed(() => {
  const out = medicines.value.filter((item) => stockState(item) === 'Out of Stock').length;
  const low = medicines.value.filter((item) => stockState(item) === 'Low').length;
  const healthy = medicines.value.filter((item) => stockState(item) === 'Healthy').length;
  const expiring = medicines.value.filter((item) => expiryState(item) === 'Expiring Soon').length;

  return {
    out,
    low,
    healthy,
    expiring
  };
});

const filteredMedicines = computed(() => {
  let rows = [...medicines.value];
  const query = searchQuery.value.trim().toLowerCase();

  if (categoryFilter.value !== 'All Categories') {
    rows = rows.filter((item) => item.category === categoryFilter.value);
  }

  if (stockFilter.value !== 'All') {
    rows = rows.filter((item) => stockState(item) === stockFilter.value);
  }

  if (quickFilter.value === 'out') {
    rows = rows.filter((item) => stockState(item) === 'Out of Stock');
  } else if (quickFilter.value === 'low') {
    rows = rows.filter((item) => stockState(item) === 'Low');
  } else if (quickFilter.value === 'healthy') {
    rows = rows.filter((item) => stockState(item) === 'Healthy');
  } else if (quickFilter.value === 'expiring') {
    rows = rows.filter((item) => expiryState(item) === 'Expiring Soon');
  }

  if (query) {
    rows = rows.filter((item) => {
      const target = `${item.id} ${item.name} ${item.category} ${item.type} ${item.expiryDate}`.toLowerCase();
      return target.includes(query);
    });
  }

  return rows.sort((a, b) => {
    if (sortBy.value === 'name') {
      return sortDirection.value === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    }

    if (sortBy.value === 'stock') {
      return sortDirection.value === 'asc' ? stockPercent(a) - stockPercent(b) : stockPercent(b) - stockPercent(a);
    }

    if (sortBy.value === 'type') {
      return sortDirection.value === 'asc' ? a.type.localeCompare(b.type) : b.type.localeCompare(a.type);
    }

    return sortDirection.value === 'asc' ? expiryDateValue(a) - expiryDateValue(b) : expiryDateValue(b) - expiryDateValue(a);
  });
});

const pageCount = computed(() => Math.max(1, Math.ceil(filteredMedicines.value.length / pageSize.value)));
const pagedMedicines = computed(() => {
  const start = (listPage.value - 1) * pageSize.value;
  return filteredMedicines.value.slice(start, start + pageSize.value);
});

const selectedMedicine = computed(() => medicines.value.find((item) => item.id === selectedMedicineId.value) || null);
const actionMedicine = computed(() => medicines.value.find((item) => item.id === actionMedicineId.value) || null);
const actionMedicineOptions = computed(() =>
  medicines.value
    .map((item) => ({ title: `${item.name} (#${item.id})`, value: item.id }))
    .sort((a, b) => a.title.localeCompare(b.title))
);
const pendingRequests = computed(() => dispenseRequests.value.filter((item) => item.status === 'Pending'));
const historyMedicine = computed(() => medicines.value.find((item) => item.id === historyMedicineId.value) || null);
const historyItems = computed(() => {
  if (!historyMedicineId.value) return [];
  return stockHistory.value[historyMedicineId.value] || [];
});
const showingText = computed(() => {
  if (filteredMedicines.value.length === 0) return 'Showing 0-0 of 0 medicines';
  const start = (listPage.value - 1) * pageSize.value + 1;
  const end = Math.min(listPage.value * pageSize.value, filteredMedicines.value.length);
  return `Showing ${start}-${end} of ${filteredMedicines.value.length} medicines`;
});

watch([searchQuery, categoryFilter, stockFilter, quickFilter, pageSize], () => {
  listPage.value = 1;
});

watch(pageCount, (count) => {
  if (listPage.value > count) listPage.value = count;
});

watch(filteredMedicines, (rows) => {
  if (rows.length === 0) {
    selectedMedicineId.value = null;
    return;
  }

  const exists = rows.some((row) => row.id === selectedMedicineId.value);
  if (!exists) selectedMedicineId.value = rows[0].id;
});

const dialogTitle = computed(() => {
  if (actionType.value === 'add') return 'Add New Medicine';
  if (actionType.value === 'edit') return 'Edit Medicine';
  if (actionType.value === 'archive') return 'Archive Medicine';
  if (actionType.value === 'restock') return 'Restock Medicine';
  if (actionType.value === 'dispense') return 'Dispense Medicine';
  return 'Fulfill Dispense Request';
});

const dialogActionText = computed(() => {
  if (actionType.value === 'add') return 'Add Medicine';
  if (actionType.value === 'edit') return 'Save Changes';
  if (actionType.value === 'archive') return 'Archive';
  if (actionType.value === 'restock') return 'Restock';
  if (actionType.value === 'dispense') return 'Dispense';
  return 'Fulfill';
});

function setQuickFilter(filter: QuickFilter): void {
  quickFilter.value = filter;
}

function toggleSort(key: SortKey): void {
  if (sortBy.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }

  sortBy.value = key;
  sortDirection.value = key === 'stock' ? 'asc' : 'desc';
}

function sortIcon(key: SortKey): string {
  if (sortBy.value !== key) return 'mdi-swap-vertical';
  return sortDirection.value === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down';
}

function showToast(text: string, color: 'success' | 'info' | 'warning' | 'error' = 'success'): void {
  snackbarText.value = text;
  snackbarColor.value = color;
  snackbar.value = true;
}

function statusChipColor(state: StockState): string {
  if (state === 'Out of Stock') return 'error';
  if (state === 'Low') return 'warning';
  return 'success';
}

function openAlerts(): void {
  alertsDialog.value = true;
}

function openHistoryDrawer(medicine: Medicine): void {
  selectedMedicineId.value = medicine.id;
  historyMedicineId.value = medicine.id;
  historyDrawer.value = true;
}

function openSelectedMedicineModal(medicine?: Medicine): void {
  if (medicine) {
    selectedMedicineId.value = medicine.id;
  }

  if (!selectedMedicine.value) {
    showToast('Select a medicine first.', 'warning');
    return;
  }

  selectedMedicineDialog.value = true;
}

function openAction(type: ActionType, medicine?: Medicine, request?: DispenseRequest): void {
  actionType.value = type;
  actionRequest.value = null;

  if (type === 'add') {
    resetForms();
    actionMedicineId.value = null;
    actionDialog.value = true;
    return;
  }

  if (type === 'fulfill') {
    const targetRequest = request;
    if (!targetRequest) {
      showToast('No dispense request selected.', 'warning');
      return;
    }
    actionRequest.value = targetRequest;
    actionMedicineId.value = medicines.value.find((item) => item.name === targetRequest.medicineName)?.id || null;
    actionDialog.value = true;
    return;
  }

  const targetMedicine = medicine || selectedMedicine.value;
  if (!targetMedicine) {
    showToast('Select a medicine first.', 'warning');
    return;
  }

  actionMedicineId.value = targetMedicine.id;
  if (type === 'edit') {
    editForm.type = targetMedicine.type;
    editForm.category = targetMedicine.category;
    editForm.capacity = targetMedicine.capacity;
    editForm.lowThreshold = targetMedicine.lowThreshold;
    editForm.expiryDate = targetMedicine.expiryDate;
  }
  if (type === 'restock') {
    restockForm.quantity = Math.max(10, targetMedicine.lowThreshold);
    restockForm.batchNo = '';
    restockForm.batchExpiry = targetMedicine.expiryDate;
  }
  if (type === 'dispense') {
    dispenseForm.patientName = '';
    dispenseForm.quantity = 1;
    dispenseForm.notes = '';
  }
  actionDialog.value = true;
}

function resetForms(): void {
  addForm.name = '';
  addForm.category = 'Tablet';
  addForm.type = '';
  addForm.capacity = 100;
  addForm.stock = 100;
  addForm.lowThreshold = 25;
  addForm.expiryDate = '';
  addForm.unit = 'tabs';
  restockForm.quantity = 20;
  restockForm.batchNo = '';
  restockForm.batchExpiry = '';
}

function pushLog(detail: string, actor: string, tone: 'success' | 'warning' | 'info'): void {
  const id = inventoryLogs.value.length > 0 ? Math.max(...inventoryLogs.value.map((item) => item.id)) + 1 : 1;
  inventoryLogs.value.unshift({
    id,
    detail,
    actor,
    at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    tone
  });
}

async function submitAction(): Promise<void> {
  actionLoading.value = true;
  await new Promise((resolve) => setTimeout(resolve, 420));

  if (actionType.value === 'add') {
    if (!addForm.name.trim() || !addForm.type.trim()) {
      actionLoading.value = false;
      showToast('Medicine name and type are required.', 'error');
      return;
    }

    const newId = Math.max(...medicines.value.map((item) => item.id)) + 1;
    const newItem: Medicine = {
      id: newId,
      name: addForm.name.trim(),
      category: addForm.category,
      type: addForm.type.trim(),
      stock: addForm.stock,
      capacity: addForm.capacity,
      lowThreshold: addForm.lowThreshold,
      expiryDate: addForm.expiryDate || 'Dec 31, 2027',
      unit: addForm.unit.trim() || 'units'
    };
    medicines.value.unshift(newItem);
    selectedMedicineId.value = newItem.id;
    pushLog(`${newItem.name} added to inventory`, 'Pharmacy Admin', 'success');
    showToast(`${newItem.name} added successfully.`);
  }

  if (actionType.value === 'edit') {
    const item = actionMedicine.value;
    if (!item) {
      actionLoading.value = false;
      showToast('No medicine selected.', 'warning');
      return;
    }

    item.type = editForm.type.trim() || item.type;
    item.category = editForm.category;
    item.capacity = Math.max(1, editForm.capacity);
    item.lowThreshold = Math.max(0, editForm.lowThreshold);
    item.expiryDate = editForm.expiryDate || item.expiryDate;
    if (item.stock > item.capacity) {
      item.stock = item.capacity;
    }
    pushLog(`${item.name} profile updated`, 'Pharmacy Admin', 'info');
    showToast(`${item.name} updated.`);
  }

  if (actionType.value === 'archive') {
    const item = actionMedicine.value;
    if (!item) {
      actionLoading.value = false;
      showToast('No medicine selected.', 'warning');
      return;
    }

    medicines.value = medicines.value.filter((row) => row.id !== item.id);
    if (selectedMedicineId.value === item.id) {
      selectedMedicineId.value = medicines.value[0]?.id ?? null;
    }
    delete stockHistory.value[item.id];
    pushLog(`${item.name} archived`, 'Pharmacy Admin', 'warning');
    showToast(`${item.name} archived.`, 'info');
  }

  if (actionType.value === 'restock') {
    const item = actionMedicine.value;
    if (!item) {
      actionLoading.value = false;
      showToast('No medicine selected.', 'warning');
      return;
    }

    if (restockForm.quantity <= 0) {
      actionLoading.value = false;
      showToast('Restock quantity must be greater than zero.', 'error');
      return;
    }

    const before = item.stock;
    item.stock = Math.min(item.capacity, item.stock + restockForm.quantity);
    const added = item.stock - before;
    if (restockForm.batchExpiry) {
      item.expiryDate = restockForm.batchExpiry;
    }
    const batchText = restockForm.batchNo ? ` (Batch ${restockForm.batchNo})` : '';
    pushLog(`${item.name} restocked +${added}${batchText}`, 'Nurse Carla', 'success');
    const existingHistory = stockHistory.value[item.id] || [];
    existingHistory.unshift({
      id: existingHistory.length + 1,
      event: 'Restock',
      by: 'Nurse Carla',
      at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      detail: `+${added} ${item.unit}${batchText || ''}`
    });
    stockHistory.value[item.id] = existingHistory;
    showToast(`${item.name} restocked.`);
  }

  if (actionType.value === 'dispense') {
    const item = actionMedicine.value;
    if (!item) {
      actionLoading.value = false;
      showToast('No medicine selected.', 'warning');
      return;
    }

    if (!dispenseForm.patientName.trim()) {
      actionLoading.value = false;
      showToast('Patient name is required.', 'error');
      return;
    }

    if (dispenseForm.quantity <= 0) {
      actionLoading.value = false;
      showToast('Invalid dispense quantity.', 'error');
      return;
    }

    if (dispenseForm.quantity > item.stock) {
      actionLoading.value = false;
      showToast('Insufficient stock for this dispense request.', 'error');
      return;
    }

    item.stock -= dispenseForm.quantity;
    pushLog(`${item.name} dispensed -${dispenseForm.quantity}`, 'Nurse Carla', 'info');
    const existingHistory = stockHistory.value[item.id] || [];
    existingHistory.unshift({
      id: existingHistory.length + 1,
      event: 'Dispense',
      by: 'Nurse Carla',
      at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      detail: `-${dispenseForm.quantity} ${item.unit} for ${dispenseForm.patientName}`
    });
    stockHistory.value[item.id] = existingHistory;
    showToast('Medicine dispensed successfully.', 'success');
  }

  if (actionType.value === 'fulfill') {
    const request = actionRequest.value;
    if (!request) {
      actionLoading.value = false;
      showToast('No request selected.', 'warning');
      return;
    }

    const item = medicines.value.find((row) => row.name === request.medicineName);
    if (!item) {
      actionLoading.value = false;
      showToast('Mapped medicine not found in inventory.', 'error');
      return;
    }

    if (request.status === 'Fulfilled') {
      actionLoading.value = false;
      showToast('Request is already fulfilled.', 'warning');
      return;
    }

    if (request.quantity > item.stock) {
      actionLoading.value = false;
      showToast('Cannot fulfill request due to insufficient stock.', 'error');
      return;
    }

    request.status = 'Fulfilled';
    item.stock -= request.quantity;
    pushLog(`${item.name} dispense request #${request.id} fulfilled`, 'Pharmacy Staff', 'success');
    const existingHistory = stockHistory.value[item.id] || [];
    existingHistory.unshift({
      id: existingHistory.length + 1,
      event: 'Fulfill',
      by: 'Pharmacy Staff',
      at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      detail: `Request #${request.id} fulfilled (-${request.quantity} ${item.unit})`
    });
    stockHistory.value[item.id] = existingHistory;
    showToast(`Request #${request.id} fulfilled.`);
  }

  actionLoading.value = false;
  actionDialog.value = false;
}
</script>

<template>
  <div class="pharmacy-page">
    <div v-if="pageLoading">
      <v-skeleton-loader type="heading, text" class="mb-4" />
      <v-skeleton-loader type="image" class="mb-4" />
      <v-row>
        <v-col cols="12" lg="8">
          <v-skeleton-loader type="table-heading, table-row-divider@6" />
        </v-col>
        <v-col cols="12" lg="4">
          <v-skeleton-loader type="image, list-item-two-line@5" />
        </v-col>
      </v-row>
    </div>

    <div v-else class="pharmacy-content" :class="{ 'is-ready': pageReady }">
      <v-card class="hero-card mb-4" elevation="0">
        <v-card-text class="pa-6">
          <v-row align="center">
            <v-col cols="12" md="8">
              <div class="hero-kicker">Dispensing & Stock</div>
              <h1 class="text-h3 font-weight-black mb-2">Pharmacy & Inventory</h1>
              <p class="text-subtitle-1 hero-subtitle mb-0">
                Manage and dispense medicines, track stock levels, and control low-stock alerts.
              </p>
            </v-col>
            <v-col cols="12" md="4" class="d-flex justify-md-end mt-3 mt-md-0">
              <v-btn class="saas-btn saas-btn-light" size="large" prepend-icon="mdi-plus" @click="openAction('add')">
                Add New Medicine
              </v-btn>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-row class="mb-4">
        <v-col cols="12" sm="6" lg="3">
          <v-card class="metric-card metric-total" elevation="0">
            <v-card-text>
              <div class="metric-title">Total Medicines</div>
              <div class="metric-value">{{ totals.total }}</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <v-card class="metric-card metric-low" elevation="0">
            <v-card-text>
              <div class="metric-title">Low Stock Alerts</div>
              <div class="metric-value">{{ totals.low }}</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <v-card class="metric-card metric-out" elevation="0">
            <v-card-text>
              <div class="metric-title">Out Of Stock</div>
              <div class="metric-value">{{ totals.out }}</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <v-card class="metric-card metric-pending" elevation="0">
            <v-card-text>
              <div class="metric-title">Pending Dispense</div>
              <div class="metric-value">{{ totals.pending }}</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-card class="surface-card mb-4" variant="outlined">
        <v-card-text>
          <v-row>
            <v-col cols="12" md="3">
              <v-select v-model="categoryFilter" :items="categoryItems" label="Categories" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <v-col cols="12" md="3">
              <v-select
                v-model="stockFilter"
                :items="['All', 'Healthy', 'Low', 'Out of Stock']"
                label="Stock State"
                variant="outlined"
                density="comfortable"
                hide-details
              />
            </v-col>
            <v-col cols="12" md="3">
              <v-btn class="saas-btn saas-btn-warning w-100" prepend-icon="mdi-bell-alert" @click="openAlerts">
                Low Stock Alerts ({{ lowStockList.length }})
              </v-btn>
            </v-col>
            <v-col cols="12" md="3">
              <v-text-field
                v-model="searchQuery"
                label="Search"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-magnify"
                hide-details
              />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-row class="mb-4">
        <v-col cols="12">
          <v-card class="surface-card h-100" variant="outlined">
            <v-card-item>
              <v-card-title>Medicine Stock Levels</v-card-title>
            </v-card-item>
            <v-card-text>
              <div class="summary-alert-bar mb-4">
                <button type="button" class="summary-alert alert-out" :class="{ active: quickFilter === 'out' }" @click="setQuickFilter('out')">
                  <span>🔴</span>
                  <span>{{ summaryAlerts.out }} Out of Stock</span>
                </button>
                <button type="button" class="summary-alert alert-low" :class="{ active: quickFilter === 'low' }" @click="setQuickFilter('low')">
                  <span>🟡</span>
                  <span>{{ summaryAlerts.low }} Low Stock</span>
                </button>
                <button type="button" class="summary-alert alert-healthy" :class="{ active: quickFilter === 'healthy' }" @click="setQuickFilter('healthy')">
                  <span>🟢</span>
                  <span>{{ summaryAlerts.healthy }} Healthy</span>
                </button>
                <button type="button" class="summary-alert alert-expiring" :class="{ active: quickFilter === 'expiring' }" @click="setQuickFilter('expiring')">
                  <span>⏳</span>
                  <span>{{ summaryAlerts.expiring }} Expiring Soon</span>
                </button>
              </div>

              <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
                <div class="filter-chip-row">
                  <button type="button" class="quick-filter-chip" :class="{ active: quickFilter === 'all' }" @click="setQuickFilter('all')">All</button>
                  <button type="button" class="quick-filter-chip" :class="{ active: quickFilter === 'low' }" @click="setQuickFilter('low')">Low Stock</button>
                  <button type="button" class="quick-filter-chip" :class="{ active: quickFilter === 'out' }" @click="setQuickFilter('out')">Out of Stock</button>
                  <button type="button" class="quick-filter-chip" :class="{ active: quickFilter === 'expiring' }" @click="setQuickFilter('expiring')">
                    Expiring Soon
                  </button>
                  <button type="button" class="quick-filter-chip" :class="{ active: quickFilter === 'healthy' }" @click="setQuickFilter('healthy')">Healthy</button>
                </div>

                <div class="d-flex align-center ga-2">
                  <span class="text-caption text-medium-emphasis">Items per page</span>
                  <v-select v-model="pageSize" :items="pageSizeOptions" density="compact" variant="outlined" hide-details style="max-width: 90px" />
                </div>
              </div>

              <div class="stock-table-wrap">
                <v-table density="comfortable">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>
                        <button class="sortable-head" type="button" @click="toggleSort('name')">
                          MEDICINE NAME <v-icon :icon="sortIcon('name')" size="14" />
                        </button>
                      </th>
                      <th>
                        <button class="sortable-head" type="button" @click="toggleSort('stock')">
                          STOCK LEVEL <v-icon :icon="sortIcon('stock')" size="14" />
                        </button>
                      </th>
                      <th>
                        <button class="sortable-head" type="button" @click="toggleSort('type')">
                          TYPE <v-icon :icon="sortIcon('type')" size="14" />
                        </button>
                      </th>
                      <th>
                        <button class="sortable-head" type="button" @click="toggleSort('expiry')">
                          EXPIRY DATE <v-icon :icon="sortIcon('expiry')" size="14" />
                        </button>
                      </th>
                      <th class="text-right action-col">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in pagedMedicines"
                      :key="item.id"
                      :class="[
                        'stock-row',
                        stockState(item) === 'Out of Stock' ? 'stock-row-out' : stockState(item) === 'Low' ? 'stock-row-low' : 'stock-row-healthy',
                        { 'selected-row': selectedMedicineId === item.id }
                      ]"
                      @click="openHistoryDrawer(item)"
                    >
                      <td>#{{ item.id }}</td>
                      <td>
                        <div class="font-weight-bold">{{ item.name }}</div>
                        <div class="text-caption text-medium-emphasis">{{ item.category }}</div>
                      </td>
                      <td>
                        <div class="d-flex align-center ga-2">
                          <v-chip size="small" :color="statusChipColor(stockState(item))" variant="tonal">{{ stockState(item) }}</v-chip>
                          <div class="stock-inline">
                            <div class="stock-summary">
                              <span>{{ item.stock }} left of {{ item.capacity }}</span>
                              <span>{{ stockPercent(item) }}%</span>
                            </div>
                            <div class="stock-bar stock-bar-thick">
                              <span :style="{ width: `${stockPercent(item)}%`, background: stockToneByPercent(stockPercent(item)) }"></span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{{ item.type }}</td>
                      <td>
                        <div>{{ item.expiryDate }}</div>
                        <v-chip size="x-small" :color="expiryStateColor(expiryState(item))" variant="tonal">{{ expiryState(item) }}</v-chip>
                      </td>
                      <td class="text-right action-col">
                        <div class="action-cell">
                          <v-btn size="small" class="saas-btn saas-btn-primary action-primary-btn" @click.stop="openAction('restock', item)">Restock</v-btn>
                          <v-menu location="bottom end">
                            <template #activator="{ props }">
                              <v-btn
                                v-bind="props"
                                size="small"
                                variant="outlined"
                                color="primary"
                                class="saas-btn saas-btn-ghost action-more-btn"
                                append-icon="mdi-chevron-down"
                              >
                                More
                              </v-btn>
                            </template>
                            <v-list density="compact" min-width="180">
                              <v-list-item prepend-icon="mdi-pencil-outline" title="Edit" @click="openAction('edit', item)" />
                              <v-list-item prepend-icon="mdi-eye-outline" title="View Details" @click="openSelectedMedicineModal(item)" />
                              <v-list-item prepend-icon="mdi-pill" title="Dispense" @click="openAction('dispense', item)" />
                              <v-list-item prepend-icon="mdi-archive-outline" title="Archive" @click="openAction('archive', item)" />
                            </v-list>
                          </v-menu>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="pagedMedicines.length === 0">
                      <td colspan="6" class="text-center text-medium-emphasis py-4">No medicines found.</td>
                    </tr>
                  </tbody>
                </v-table>
              </div>

              <div class="d-flex align-center justify-space-between mt-3 flex-wrap ga-2">
                <div class="text-caption text-medium-emphasis">{{ showingText }}</div>
                <v-pagination v-model="listPage" :length="pageCount" density="comfortable" :total-visible="5" />
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-card class="surface-card" variant="outlined">
        <v-card-item>
          <v-card-title>Pending Dispense Requests</v-card-title>
        </v-card-item>
        <v-card-text>
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>ID</th>
                <th>PATIENT</th>
                <th>MEDICINE</th>
                <th>QTY</th>
                <th>NOTES</th>
                <th>STATUS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="request in pendingRequests" :key="request.id">
                <td>#{{ request.id }}</td>
                <td>{{ request.patientName }}</td>
                <td>{{ request.medicineName }}</td>
                <td>{{ request.quantity }}</td>
                <td>{{ request.notes }}</td>
                <td><v-chip size="small" color="warning" variant="tonal">{{ request.status }}</v-chip></td>
                <td class="text-right">
                  <v-btn class="saas-btn saas-btn-success" size="small" @click="openAction('fulfill', undefined, request)">Fulfill</v-btn>
                </td>
              </tr>
              <tr v-if="pendingRequests.length === 0">
                <td colspan="7" class="text-center text-medium-emphasis py-4">No pending dispense requests.</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>

      <v-card class="surface-card mt-4" variant="outlined">
        <v-card-item>
          <v-card-title>Recent Inventory Logs</v-card-title>
        </v-card-item>
        <v-card-text>
          <v-list lines="two" class="py-0">
            <v-list-item v-for="log in inventoryLogs.slice(0, 8)" :key="log.id">
              <template #prepend>
                <v-icon
                  :icon="log.tone === 'success' ? 'mdi-check-circle' : log.tone === 'warning' ? 'mdi-alert' : 'mdi-information'"
                  :color="log.tone"
                />
              </template>
              <v-list-item-title>{{ log.detail }}</v-list-item-title>
              <v-list-item-subtitle>{{ log.actor }} • {{ log.at }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </div>

    <v-navigation-drawer v-model="historyDrawer" temporary location="right" width="420">
      <div class="history-drawer" v-if="historyMedicine">
        <div class="d-flex align-center justify-space-between px-4 py-3 history-head">
          <div>
            <div class="text-subtitle-1 font-weight-bold">Stock History</div>
            <div class="text-body-2 text-medium-emphasis">{{ historyMedicine.name }} #{{ historyMedicine.id }}</div>
          </div>
          <v-btn icon="mdi-close" variant="text" @click="historyDrawer = false" />
        </div>

        <div class="px-4 py-3">
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-body-2">Current Stock</span>
            <strong>{{ historyMedicine.stock }}/{{ historyMedicine.capacity }}</strong>
          </div>
          <div class="d-flex align-center justify-space-between mb-4">
            <span class="text-body-2">Expiry</span>
            <v-chip size="small" :color="expiryStateColor(expiryState(historyMedicine))" variant="tonal">
              {{ historyMedicine.expiryDate }}
            </v-chip>
          </div>

          <div class="text-subtitle-2 font-weight-bold mb-2">Movements</div>
          <v-timeline density="compact" side="end" align="start" truncate-line="start">
            <v-timeline-item v-for="entry in historyItems" :key="`${historyMedicine.id}-${entry.id}`" dot-color="primary" size="x-small">
              <div class="text-body-2 font-weight-bold">{{ entry.event }}</div>
              <div class="text-caption text-medium-emphasis">{{ entry.detail }}</div>
              <div class="text-caption text-medium-emphasis">{{ entry.by }} • {{ entry.at }}</div>
            </v-timeline-item>
            <v-timeline-item v-if="historyItems.length === 0" dot-color="grey" size="x-small">
              <div class="text-caption text-medium-emphasis">No movement history yet.</div>
            </v-timeline-item>
          </v-timeline>
        </div>
      </div>
    </v-navigation-drawer>

    <v-dialog v-model="selectedMedicineDialog" max-width="560" transition="dialog-bottom-transition">
      <v-card v-if="selectedMedicine">
        <v-card-item>
          <v-card-title>Medicine Actions</v-card-title>
          <template #append>
            <v-btn icon="mdi-close" variant="text" @click="selectedMedicineDialog = false" />
          </template>
        </v-card-item>
        <v-divider />
        <v-card-text class="pt-5">
          <div class="text-h5 font-weight-bold">{{ selectedMedicine.name }}</div>
          <div class="text-body-2 text-medium-emphasis mb-3">#{{ selectedMedicine.id }} • {{ selectedMedicine.type }}</div>

          <div class="d-flex align-center justify-space-between mb-2">
            <span>Stock State</span>
            <v-chip size="small" :color="statusChipColor(stockState(selectedMedicine))" variant="tonal">{{ stockState(selectedMedicine) }}</v-chip>
          </div>
          <div class="d-flex align-center justify-space-between mb-2">
            <span>Stock</span>
            <strong>{{ selectedMedicine.stock }}/{{ selectedMedicine.capacity }}</strong>
          </div>
          <div class="d-flex align-center justify-space-between mb-4">
            <span>Expiry</span>
            <strong>{{ selectedMedicine.expiryDate }}</strong>
          </div>

          <div class="d-grid ga-2 mb-2">
            <v-btn
              class="saas-btn saas-btn-primary"
              prepend-icon="mdi-truck-fast-outline"
              @click="
                selectedMedicineDialog = false;
                openAction('restock', selectedMedicine);
              "
            >
              Restock
            </v-btn>
            <v-btn
              class="saas-btn saas-btn-info"
              prepend-icon="mdi-pill"
              @click="
                selectedMedicineDialog = false;
                openAction('dispense', selectedMedicine);
              "
            >
              Dispense
            </v-btn>
          </div>
          <div class="d-flex align-center ga-2">
            <v-btn
              class="saas-btn saas-btn-ghost"
              prepend-icon="mdi-bell-alert"
              @click="
                selectedMedicineDialog = false;
                openAlerts();
              "
            >
              View Alerts
            </v-btn>
            <v-chip class="alerts-chip" color="warning" variant="tonal" size="small">
              {{ lowStockList.length }} active alerts
            </v-chip>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="alertsDialog" max-width="760" transition="dialog-bottom-transition">
      <v-card>
        <v-card-item>
          <v-card-title>Low Stock Alerts ({{ lowStockList.length }})</v-card-title>
          <template #append>
            <v-btn icon="mdi-close" variant="text" @click="alertsDialog = false" />
          </template>
        </v-card-item>
        <v-divider />
        <v-card-text>
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>MEDICINE</th>
                <th>STOCK</th>
                <th>STATE</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in lowStockList" :key="`alert-${item.id}`">
                <td>
                  <div class="font-weight-bold">{{ item.name }}</div>
                  <div class="text-caption text-medium-emphasis">#{{ item.id }}</div>
                </td>
                <td>{{ item.stock }}/{{ item.capacity }}</td>
                <td><v-chip size="small" :color="statusChipColor(stockState(item))" variant="tonal">{{ stockState(item) }}</v-chip></td>
                <td class="text-right">
                  <v-btn class="saas-btn saas-btn-primary" size="small" @click="alertsDialog = false; openAction('restock', item)">Restock</v-btn>
                </td>
              </tr>
              <tr v-if="lowStockList.length === 0">
                <td colspan="4" class="text-center text-medium-emphasis py-4">No active alerts.</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="actionDialog" max-width="680" transition="dialog-bottom-transition">
      <v-card>
        <v-card-item>
          <v-card-title>{{ dialogTitle }}</v-card-title>
          <template #append>
            <v-btn icon="mdi-close" variant="text" @click="actionDialog = false" />
          </template>
        </v-card-item>
        <v-divider />

        <v-card-text class="pt-5">
          <template v-if="actionType === 'add'">
            <v-row>
              <v-col cols="12" md="6">
                <v-text-field v-model="addForm.name" label="Medicine Name" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="addForm.type" label="Medicine Type" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-select v-model="addForm.category" :items="['Tablet', 'Capsule', 'Syrup', 'Inhaler', 'Injection']" label="Category" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="addForm.expiryDate" label="Expiry Date" placeholder="e.g. Dec 31, 2027" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model.number="addForm.capacity" type="number" label="Capacity" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model.number="addForm.stock" type="number" label="Initial Stock" variant="outlined" density="comfortable" />
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model.number="addForm.lowThreshold" type="number" label="Low Stock Threshold" variant="outlined" density="comfortable" />
              </v-col>
            </v-row>
          </template>

          <template v-else-if="actionType === 'edit'">
            <v-select
              v-model="actionMedicineId"
              :items="actionMedicineOptions"
              label="Select Medicine To Edit"
              variant="outlined"
              density="comfortable"
              class="mb-3"
            />
            <template v-if="actionMedicine">
              <v-row>
                <v-col cols="12" md="6">
                  <v-text-field v-model="editForm.type" label="Medicine Type" variant="outlined" density="comfortable" />
                </v-col>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="editForm.category"
                    :items="['Tablet', 'Capsule', 'Syrup', 'Inhaler', 'Injection']"
                    label="Category"
                    variant="outlined"
                    density="comfortable"
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model.number="editForm.capacity" type="number" label="Capacity" variant="outlined" density="comfortable" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model.number="editForm.lowThreshold" type="number" label="Low Threshold" variant="outlined" density="comfortable" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="editForm.expiryDate" label="Expiry Date" variant="outlined" density="comfortable" />
                </v-col>
              </v-row>
            </template>
            <p v-else class="text-medium-emphasis mb-0">Select a medicine to continue.</p>
          </template>

          <template v-else-if="actionType === 'archive'">
            <v-select
              v-model="actionMedicineId"
              :items="actionMedicineOptions"
              label="Select Medicine To Archive"
              variant="outlined"
              density="comfortable"
              class="mb-3"
            />
            <p v-if="actionMedicine" class="text-body-1 mb-0">
              Archive <strong>{{ actionMedicine.name }}</strong>? This removes it from active inventory list.
            </p>
            <p v-else class="text-medium-emphasis mb-0">Select a medicine to continue.</p>
          </template>

          <template v-else-if="actionType === 'restock'">
            <v-select
              v-model="actionMedicineId"
              :items="actionMedicineOptions"
              label="Select Medicine To Restock"
              variant="outlined"
              density="comfortable"
              class="mb-3"
            />
            <template v-if="actionMedicine">
              <p class="text-body-1 mb-3">
                Restock <strong>{{ actionMedicine.name }}</strong> (Current: {{ actionMedicine.stock }}/{{ actionMedicine.capacity }})
              </p>
              <v-row>
                <v-col cols="12" md="4">
                  <v-text-field v-model.number="restockForm.quantity" type="number" label="Quantity" variant="outlined" density="comfortable" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="restockForm.batchNo" label="Batch Number" variant="outlined" density="comfortable" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="restockForm.batchExpiry" label="Batch Expiry" variant="outlined" density="comfortable" />
                </v-col>
              </v-row>
            </template>
            <p v-else class="text-medium-emphasis mb-0">Select a medicine to continue.</p>
          </template>

          <template v-else-if="actionType === 'dispense'">
            <v-select
              v-model="actionMedicineId"
              :items="actionMedicineOptions"
              label="Select Medicine To Dispense"
              variant="outlined"
              density="comfortable"
              class="mb-3"
            />
            <template v-if="actionMedicine">
              <p class="text-body-1 mb-3">
                Dispense <strong>{{ actionMedicine.name }}</strong> (Available: {{ actionMedicine.stock }} {{ actionMedicine.unit }})
              </p>
              <v-row>
                <v-col cols="12" md="6">
                  <v-text-field v-model="dispenseForm.patientName" label="Patient Name" variant="outlined" density="comfortable" />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field v-model.number="dispenseForm.quantity" type="number" label="Quantity" variant="outlined" density="comfortable" />
                </v-col>
                <v-col cols="12">
                  <v-textarea v-model="dispenseForm.notes" rows="3" label="Instruction Notes" variant="outlined" density="comfortable" />
                </v-col>
              </v-row>
            </template>
            <p v-else class="text-medium-emphasis mb-0">Select a medicine to continue.</p>
          </template>

          <template v-else-if="actionType === 'fulfill' && actionRequest">
            <p class="text-body-1 mb-2">
              Fulfill request <strong>#{{ actionRequest.id }}</strong> for <strong>{{ actionRequest.patientName }}</strong>.
            </p>
            <p class="text-medium-emphasis mb-0">
              Medicine: {{ actionRequest.medicineName }} • Quantity: {{ actionRequest.quantity }} • Note: {{ actionRequest.notes }}
            </p>
          </template>
        </v-card-text>

        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn class="saas-btn saas-btn-ghost" variant="text" @click="actionDialog = false">Cancel</v-btn>
          <v-btn class="saas-btn saas-btn-primary" :loading="actionLoading" @click="submitAction">{{ dialogActionText }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="2400">{{ snackbarText }}</v-snackbar>
  </div>
</template>

<style scoped>
.pharmacy-page {
  background: radial-gradient(1000px 560px at 4% -12%, rgba(68, 108, 221, 0.14), transparent 60%),
    radial-gradient(860px 500px at 97% 4%, rgba(168, 91, 255, 0.1), transparent 58%);
}

.pharmacy-content {
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 260ms ease, transform 260ms ease;
}

.pharmacy-content.is-ready {
  opacity: 1;
  transform: translateY(0);
}

.hero-card {
  border-radius: 18px;
  color: #fff;
  background: linear-gradient(120deg, #152a7c 0%, #3063cc 52%, #47a8f2 100%);
  box-shadow: 0 16px 34px rgba(20, 45, 126, 0.24);
}

.hero-kicker {
  display: inline-flex;
  font-size: 12px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  font-weight: 800;
  border-radius: 999px;
  padding: 4px 10px;
  margin-bottom: 10px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.hero-subtitle {
  color: rgba(255, 255, 255, 0.9) !important;
}

.surface-card {
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
}

.metric-card {
  border-radius: 12px;
  color: #fff;
  box-shadow: 0 10px 22px rgba(19, 39, 108, 0.2);
}

.metric-total {
  background: linear-gradient(135deg, #2f64d0 0%, #3f8df2 100%);
}

.metric-low {
  background: linear-gradient(135deg, #e88235 0%, #f59e0b 100%);
}

.metric-out {
  background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
}

.metric-pending {
  background: linear-gradient(135deg, #0891b2 0%, #0284c7 100%);
}

.metric-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  font-weight: 700;
}

.metric-value {
  font-size: 34px;
  line-height: 1.1;
  font-weight: 800;
}

.summary-alert-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.summary-alert {
  border: 1px solid rgba(86, 113, 172, 0.24);
  border-radius: 12px;
  padding: 10px 12px;
  background: #f8faff;
  font-weight: 700;
  color: #304a7d;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 180ms ease;
}

.summary-alert:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 16px rgba(32, 61, 122, 0.12);
}

.summary-alert.active {
  border-color: rgba(60, 111, 212, 0.42);
  background: #eef4ff;
}

.filter-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-filter-chip {
  border: 1px solid rgba(80, 112, 176, 0.23);
  border-radius: 999px;
  padding: 6px 12px;
  background: #f7f9ff;
  color: #425f95;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 160ms ease;
}

.quick-filter-chip.active {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(120deg, #2f67d2 0%, #38a0ef 100%);
}

.stock-table-wrap {
  max-height: 470px;
  overflow: auto;
  border-radius: 12px;
}

.stock-table-wrap :deep(thead th) {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f8fbff;
}

.sortable-head {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  padding: 0;
  background: transparent;
  font-size: 12px;
  font-weight: 800;
  color: inherit;
  cursor: pointer;
}

.stock-row {
  transition: background 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.stock-row:hover {
  background: rgba(49, 96, 188, 0.08);
}

.action-col {
  min-width: 230px;
}

.action-cell {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.action-primary-btn {
  min-width: 94px;
  min-height: 34px;
  flex: 0 0 auto;
}

.action-more-btn {
  min-width: 86px;
  min-height: 34px;
  flex: 0 0 auto;
}

.stock-row-out {
  box-shadow: inset 4px 0 0 rgba(239, 68, 68, 0.55);
}

.stock-row-low {
  box-shadow: inset 4px 0 0 rgba(249, 115, 22, 0.55);
}

.stock-row-healthy {
  box-shadow: inset 4px 0 0 rgba(34, 197, 94, 0.5);
}

.selected-row {
  background: rgba(59, 130, 246, 0.09);
}

.stock-inline {
  min-width: 280px;
}

.stock-summary {
  font-size: 12px;
  color: #425a89;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-weight: 700;
}

.stock-bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: #e8edf8;
  overflow: hidden;
}

.stock-bar-thick {
  height: 11px;
}

.stock-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.saas-btn {
  border-radius: 12px;
  min-height: 40px;
  text-transform: none;
  font-weight: 700;
  letter-spacing: 0.2px;
  transition: transform 170ms ease, box-shadow 170ms ease;
}

.saas-btn:hover {
  transform: translateY(-1px);
}

.saas-btn-primary {
  background: linear-gradient(120deg, #2d61d0 0%, #4094ee 100%) !important;
  color: #fff !important;
  box-shadow: 0 8px 16px rgba(34, 78, 165, 0.22);
}

.saas-btn-info {
  background: linear-gradient(120deg, #1f7ad5 0%, #06b6d4 100%) !important;
  color: #fff !important;
  box-shadow: 0 8px 16px rgba(34, 115, 165, 0.2);
}

.saas-btn-success {
  background: linear-gradient(120deg, #0d9e79 0%, #22c55e 100%) !important;
  color: #fff !important;
  box-shadow: 0 8px 16px rgba(27, 130, 84, 0.2);
}

.saas-btn-warning {
  background: linear-gradient(120deg, #eb8f22 0%, #f59e0b 100%) !important;
  color: #fff !important;
  box-shadow: 0 8px 16px rgba(163, 96, 26, 0.22);
}

.saas-btn-light {
  background: #fff !important;
  color: #1b3a74 !important;
  box-shadow: 0 8px 16px rgba(23, 50, 103, 0.14);
}

.saas-btn-ghost {
  background: #f5f8ff !important;
  color: #335792 !important;
  border: 1px solid rgba(52, 92, 168, 0.22) !important;
  box-shadow: none;
}

.alerts-chip {
  font-weight: 700;
}

.history-head {
  border-bottom: 1px solid rgba(90, 112, 165, 0.24);
}

:deep(.v-theme--dark) .stock-table-wrap :deep(thead th) {
  background: rgba(24, 36, 68, 0.94);
}

:deep(.v-theme--dark) .stock-bar {
  background: rgba(255, 255, 255, 0.18);
}

:deep(.v-theme--dark) .stock-summary {
  color: rgba(231, 237, 255, 0.9);
}

:deep(.v-theme--dark) .summary-alert {
  color: #dbe8ff;
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(177, 199, 245, 0.25);
}

@media (max-width: 1120px) {
  .summary-alert-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .summary-alert-bar {
    grid-template-columns: 1fr;
  }

  .stock-inline {
    min-width: 210px;
  }
}
</style>

