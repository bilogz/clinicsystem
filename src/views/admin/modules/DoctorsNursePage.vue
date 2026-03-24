<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { fetchHrStaffDirectory, type HrStaffDirectoryRow } from '@/services/hrStaffRequests';
import { upsertDoctor } from '@/services/doctors';
import {
  listDoctorAvailability,
  upsertDoctorAvailability,
  type DoctorAvailabilityScheduleRow
} from '@/services/doctorAvailability';

const loading = ref(false);
const rows = ref<HrStaffDirectoryRow[]>([]);
const meta = reactive({ page: 1, perPage: 10, total: 0, totalPages: 1 });

const roleFilter = ref<'all' | 'doctor' | 'nurse'>('all');
const statusFilter = ref<'all' | 'active' | 'working' | 'inactive'>('all');
const attendanceFilter = ref<'all' | 'present' | 'not_logged'>('all');
const search = ref('');
const page = ref(1);
const bookingBusy = ref<Record<number, boolean>>({});
const bookingStatus = ref<Record<number, boolean>>({});
const scheduleDialog = ref(false);
const scheduleDialogLoading = ref(false);
const scheduleSaving = ref(false);
const scheduleRows = ref<DoctorAvailabilityScheduleRow[]>([]);
const selectedStaff = ref<HrStaffDirectoryRow | null>(null);
const dayOptions = [
  { title: 'Sunday', value: 0 },
  { title: 'Monday', value: 1 },
  { title: 'Tuesday', value: 2 },
  { title: 'Wednesday', value: 3 },
  { title: 'Thursday', value: 4 },
  { title: 'Friday', value: 5 },
  { title: 'Saturday', value: 6 }
];
const scheduleForm = reactive({
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '17:00',
  maxAppointments: 12,
  isActive: true
});
const scheduleFormError = ref('');

const DEFAULT_BOOKING_WINDOWS = [
  { dayOfWeek: 1, startTime: '08:00', endTime: '17:00', maxAppointments: 12 },
  { dayOfWeek: 2, startTime: '08:00', endTime: '17:00', maxAppointments: 12 },
  { dayOfWeek: 3, startTime: '08:00', endTime: '17:00', maxAppointments: 12 },
  { dayOfWeek: 4, startTime: '08:00', endTime: '17:00', maxAppointments: 12 },
  { dayOfWeek: 5, startTime: '08:00', endTime: '17:00', maxAppointments: 12 }
];

const filteredRows = computed(() => {
  if (attendanceFilter.value === 'all') return rows.value;
  return rows.value.filter((row) => {
    const attendance = row.employment_status === 'working' ? 'present' : 'not_logged';
    return attendance === attendanceFilter.value;
  });
});

const stats = computed(() => {
  const source = filteredRows.value;
  const doctors = source.filter((row) => row.role_type === 'doctor').length;
  const nurses = source.filter((row) => row.role_type === 'nurse').length;
  const presentToday = source.filter((row) => attendanceToday(row) === 'present').length;
  return {
    total: source.length,
    doctors,
    nurses,
    presentToday
  };
});

function attendanceToday(row: HrStaffDirectoryRow): 'present' | 'not_logged' {
  return row.employment_status === 'working' ? 'present' : 'not_logged';
}

function statusColor(status: string): string {
  if (status === 'working') return 'success';
  if (status === 'active') return 'primary';
  return 'grey';
}

function attendanceColor(attendance: string): string {
  return attendance === 'present' ? 'success' : 'warning';
}

async function loadDirectory(): Promise<void> {
  loading.value = true;
  try {
    const data = await fetchHrStaffDirectory({
      search: search.value.trim() || undefined,
      role: roleFilter.value === 'all' ? undefined : roleFilter.value,
      employmentStatus: statusFilter.value === 'all' ? undefined : statusFilter.value,
      page: page.value,
      perPage: meta.perPage
    });
    rows.value = data.items;
    Object.assign(meta, data.meta);
  } finally {
    loading.value = false;
  }
}

function providerKey(name: string, department: string): string {
  const normalizedName = String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const normalizedDepartment = String(department || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return `${normalizedName}::${normalizedDepartment}`;
}

async function refreshBookingStatuses(): Promise<void> {
  try {
    const schedules = await listDoctorAvailability();
    const activeSchedules = new Set(
      schedules.filter((item) => item.isActive).map((item) => providerKey(item.doctorName, item.departmentName))
    );
    const nextState: Record<number, boolean> = {};
    rows.value.forEach((row) => {
      const key = providerKey(row.full_name, row.department_name);
      nextState[row.id] = activeSchedules.has(key);
    });
    bookingStatus.value = nextState;
  } catch {
    bookingStatus.value = {};
  }
}

function isBookable(row: HrStaffDirectoryRow): boolean {
  return Boolean(bookingStatus.value[row.id]);
}

function dayLabel(dayOfWeek: number): string {
  return dayOptions.find((item) => item.value === Number(dayOfWeek))?.title || `Day ${dayOfWeek}`;
}

async function ensureProviderRegistered(name: string, department: string, roleType = 'doctor'): Promise<void> {
  await upsertDoctor({
    doctorName: String(name || '').trim(),
    departmentName: String(department || '').trim(),
    specialization: String(roleType || 'doctor').trim(),
    isActive: true,
    actor: 'Clinic Admin'
  });
}

function resetScheduleForm(): void {
  scheduleForm.dayOfWeek = 1;
  scheduleForm.startTime = '08:00';
  scheduleForm.endTime = '17:00';
  scheduleForm.maxAppointments = 12;
  scheduleForm.isActive = true;
  scheduleFormError.value = '';
}

async function loadSelectedStaffSchedules(): Promise<void> {
  if (!selectedStaff.value) {
    scheduleRows.value = [];
    return;
  }
  scheduleDialogLoading.value = true;
  try {
    scheduleRows.value = await listDoctorAvailability({
      doctorName: selectedStaff.value.full_name,
      departmentName: selectedStaff.value.department_name
    });
  } catch {
    scheduleRows.value = [];
  } finally {
    scheduleDialogLoading.value = false;
  }
}

async function openScheduleDialog(row: HrStaffDirectoryRow): Promise<void> {
  selectedStaff.value = row;
  resetScheduleForm();
  scheduleDialog.value = true;
  await loadSelectedStaffSchedules();
}

async function saveScheduleSlot(): Promise<void> {
  if (!selectedStaff.value) return;
  scheduleFormError.value = '';
  if (String(scheduleForm.startTime || '').slice(0, 5) >= String(scheduleForm.endTime || '').slice(0, 5)) {
    scheduleFormError.value = 'End time must be later than start time.';
    return;
  }
  if (Number(scheduleForm.maxAppointments || 0) <= 0) {
    scheduleFormError.value = 'Max appointments must be at least 1.';
    return;
  }
  scheduleSaving.value = true;
  try {
    await ensureProviderRegistered(
      selectedStaff.value.full_name,
      selectedStaff.value.department_name,
      selectedStaff.value.role_type
    );
    await upsertDoctorAvailability({
      doctorName: selectedStaff.value.full_name,
      departmentName: selectedStaff.value.department_name,
      dayOfWeek: Number(scheduleForm.dayOfWeek),
      startTime: String(scheduleForm.startTime || '').slice(0, 5),
      endTime: String(scheduleForm.endTime || '').slice(0, 5),
      maxAppointments: Number(scheduleForm.maxAppointments || 12),
      isActive: Boolean(scheduleForm.isActive),
      actor: 'Clinic Admin'
    });
    await loadSelectedStaffSchedules();
    await refreshBookingStatuses();
    resetScheduleForm();
  } catch (error) {
    scheduleFormError.value = error instanceof Error ? error.message : String(error);
  } finally {
    scheduleSaving.value = false;
  }
}

async function toggleScheduleRow(row: DoctorAvailabilityScheduleRow, target: boolean): Promise<void> {
  if (!selectedStaff.value) return;
  scheduleFormError.value = '';
  scheduleSaving.value = true;
  try {
    await ensureProviderRegistered(row.doctorName, row.departmentName);
    await upsertDoctorAvailability({
      doctorName: row.doctorName,
      departmentName: row.departmentName,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      maxAppointments: row.maxAppointments || 12,
      isActive: target,
      actor: 'Clinic Admin'
    });
    await loadSelectedStaffSchedules();
    await refreshBookingStatuses();
  } catch (error) {
    scheduleFormError.value = error instanceof Error ? error.message : String(error);
  } finally {
    scheduleSaving.value = false;
  }
}

async function toggleBookable(row: HrStaffDirectoryRow, target: boolean): Promise<void> {
  if (bookingBusy.value[row.id]) return;
  bookingBusy.value = { ...bookingBusy.value, [row.id]: true };
  try {
    await ensureProviderRegistered(row.full_name, row.department_name, row.role_type);
    const schedules = await listDoctorAvailability({
      doctorName: row.full_name,
      departmentName: row.department_name
    });

    if (target) {
      if (!schedules.length) {
        for (const window of DEFAULT_BOOKING_WINDOWS) {
          await upsertDoctorAvailability({
            doctorName: row.full_name,
            departmentName: row.department_name,
            dayOfWeek: window.dayOfWeek,
            startTime: window.startTime,
            endTime: window.endTime,
            maxAppointments: window.maxAppointments,
            isActive: true,
            actor: 'Clinic Admin'
          });
        }
      } else {
        for (const schedule of schedules) {
          if (schedule.isActive) continue;
          await upsertDoctorAvailability({
            doctorName: row.full_name,
            departmentName: row.department_name,
            dayOfWeek: schedule.dayOfWeek,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            maxAppointments: schedule.maxAppointments || 12,
            isActive: true,
            actor: 'Clinic Admin'
          });
        }
      }
    } else {
      for (const schedule of schedules) {
        if (!schedule.isActive) continue;
        await upsertDoctorAvailability({
          doctorName: row.full_name,
          departmentName: row.department_name,
          dayOfWeek: schedule.dayOfWeek,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          maxAppointments: schedule.maxAppointments || 12,
          isActive: false,
          actor: 'Clinic Admin'
        });
      }
    }

    await refreshBookingStatuses();
  } finally {
    bookingBusy.value = { ...bookingBusy.value, [row.id]: false };
  }
}

watch([roleFilter, statusFilter], () => {
  page.value = 1;
  void loadDirectory();
});
watch(page, () => {
  void loadDirectory();
});

watch(rows, () => {
  void refreshBookingStatuses();
});

let searchDebounce: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    page.value = 1;
    void loadDirectory();
  }, 300);
});

onMounted(() => {
  void loadDirectory();
});
</script>

<template>
  <div class="doctors-nurse-page">
    <v-card variant="outlined" class="hero-card">
      <v-card-text class="d-flex justify-space-between align-center flex-wrap ga-3">
        <div>
          <div class="hero-kicker">Clinic Workforce</div>
          <h1 class="text-h5 font-weight-black mb-1">Doctors/Nurse</h1>
          <p class="text-medium-emphasis mb-0">All doctor and nurse roster with status and attendance for today.</p>
        </div>
      </v-card-text>
    </v-card>

    <v-row class="ma-0" dense>
      <v-col cols="12" sm="6" lg="3" class="pa-1">
        <v-card variant="outlined" class="stats-card stats-card-total">
          <v-card-text>
            <div class="stats-label">Total Roster</div>
            <div class="stats-value">{{ stats.total }}</div>
            <div class="stats-hint">Doctors and nurses listed</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" lg="3" class="pa-1">
        <v-card variant="outlined" class="stats-card stats-card-doctor">
          <v-card-text>
            <div class="stats-label">Doctors</div>
            <div class="stats-value">{{ stats.doctors }}</div>
            <div class="stats-hint">Role: doctor</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" lg="3" class="pa-1">
        <v-card variant="outlined" class="stats-card stats-card-nurse">
          <v-card-text>
            <div class="stats-label">Nurses</div>
            <div class="stats-value">{{ stats.nurses }}</div>
            <div class="stats-hint">Role: nurse</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" lg="3" class="pa-1">
        <v-card variant="outlined" class="stats-card stats-card-present">
          <v-card-text>
            <div class="stats-label">Present Today</div>
            <div class="stats-value">{{ stats.presentToday }}</div>
            <div class="stats-hint">Status: working</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card variant="outlined">
      <v-card-item>
        <v-card-title>Doctors/Nurse List</v-card-title>
      </v-card-item>
      <v-card-text>
        <v-row class="mb-3">
          <v-col cols="12" md="4">
            <v-text-field
              v-model="search"
              label="Search employee no or name"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="3">
            <v-select
              v-model="roleFilter"
              :items="['all', 'doctor', 'nurse']"
              label="Filter Role"
              prepend-inner-icon="mdi-filter-variant"
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="3">
            <v-select
              v-model="statusFilter"
              :items="['all', 'active', 'working', 'inactive']"
              label="Filter Status"
              prepend-inner-icon="mdi-filter-variant"
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-select
              v-model="attendanceFilter"
              :items="['all', 'present', 'not_logged']"
              label="Attendance"
              prepend-inner-icon="mdi-filter-variant"
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </v-col>
        </v-row>

        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />

        <v-table density="comfortable">
          <thead>
            <tr>
              <th>EMPLOYEE NO</th>
              <th>NAME</th>
              <th>ROLE</th>
              <th>DEPARTMENT</th>
              <th>STATUS</th>
              <th>ATTENDANCE TODAY</th>
              <th>BOOKABLE FOR PATIENT</th>
              <th>AVAILABILITY</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredRows" :key="row.id">
              <td>{{ row.employee_no }}</td>
              <td>{{ row.full_name }}</td>
              <td>
                <v-chip size="small" variant="tonal" :color="row.role_type === 'doctor' ? 'primary' : 'deep-orange'">
                  {{ row.role_type }}
                </v-chip>
              </td>
              <td>{{ row.department_name }}</td>
              <td>
                <v-chip size="small" variant="tonal" :color="statusColor(row.employment_status)">
                  {{ row.employment_status }}
                </v-chip>
              </td>
              <td>
                <v-chip size="small" variant="tonal" :color="attendanceColor(attendanceToday(row))">
                  {{ attendanceToday(row) }}
                </v-chip>
              </td>
              <td>
                <div class="d-flex align-center ga-2">
                  <v-switch
                    :model-value="isBookable(row)"
                    color="success"
                    inset
                    hide-details
                    density="compact"
                    :loading="bookingBusy[row.id]"
                    :disabled="bookingBusy[row.id] || row.employment_status === 'inactive'"
                    @update:model-value="(value) => toggleBookable(row, Boolean(value))"
                  />
                  <v-chip size="x-small" variant="tonal" :color="isBookable(row) ? 'success' : 'warning'">
                    {{ isBookable(row) ? 'Open' : 'Closed' }}
                  </v-chip>
                </div>
              </td>
              <td>
                <v-btn
                  size="small"
                  variant="outlined"
                  color="primary"
                  :disabled="row.employment_status === 'inactive'"
                  @click="openScheduleDialog(row)"
                >
                  Edit Schedule
                </v-btn>
              </td>
            </tr>
            <tr v-if="!loading && filteredRows.length === 0">
              <td colspan="8" class="text-center text-medium-emphasis py-6">No doctor/nurse records found.</td>
            </tr>
          </tbody>
        </v-table>

        <div class="d-flex align-center mt-3 text-caption text-medium-emphasis">
          <span>Showing {{ filteredRows.length }} of {{ meta.total }}</span>
          <v-spacer />
          <v-pagination v-model="page" :length="meta.totalPages" density="comfortable" />
        </div>
      </v-card-text>
    </v-card>

    <v-dialog v-model="scheduleDialog" max-width="980">
      <v-card>
        <v-card-title class="d-flex align-center justify-space-between">
          <span>Availability Schedule - {{ selectedStaff?.full_name || '--' }}</span>
          <v-chip size="small" variant="tonal">{{ selectedStaff?.department_name || '--' }}</v-chip>
        </v-card-title>
        <v-card-text>
          <v-row class="mb-2" dense>
            <v-col cols="12" md="3">
              <v-select v-model="scheduleForm.dayOfWeek" :items="dayOptions" item-title="title" item-value="value" label="Day" density="comfortable" variant="outlined" />
            </v-col>
            <v-col cols="12" md="3">
              <v-text-field v-model="scheduleForm.startTime" label="Start Time" type="time" density="comfortable" variant="outlined" />
            </v-col>
            <v-col cols="12" md="3">
              <v-text-field v-model="scheduleForm.endTime" label="End Time" type="time" density="comfortable" variant="outlined" />
            </v-col>
            <v-col cols="12" md="2">
              <v-text-field v-model.number="scheduleForm.maxAppointments" label="Max Slots" type="number" min="1" density="comfortable" variant="outlined" />
            </v-col>
            <v-col cols="12" md="1" class="d-flex align-center justify-center">
              <v-switch v-model="scheduleForm.isActive" color="success" hide-details density="compact" />
            </v-col>
          </v-row>
          <div v-if="scheduleFormError" class="text-error text-caption mb-2">{{ scheduleFormError }}</div>
          <div class="d-flex justify-end mb-3">
            <v-btn color="primary" :loading="scheduleSaving" @click="saveScheduleSlot">Save Slot</v-btn>
          </div>

          <v-progress-linear v-if="scheduleDialogLoading" indeterminate color="primary" class="mb-2" />

          <v-table density="comfortable">
            <thead>
              <tr>
                <th>DAY</th>
                <th>START</th>
                <th>END</th>
                <th>MAX</th>
                <th>ACTIVE</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in scheduleRows" :key="`${item.dayOfWeek}-${item.startTime}-${item.endTime}`">
                <td>{{ dayLabel(item.dayOfWeek) }}</td>
                <td>{{ item.startTime }}</td>
                <td>{{ item.endTime }}</td>
                <td>{{ item.maxAppointments }}</td>
                <td>
                  <v-switch
                    :model-value="item.isActive"
                    color="success"
                    hide-details
                    density="compact"
                    :loading="scheduleSaving"
                    :disabled="scheduleSaving"
                    @update:model-value="(value) => toggleScheduleRow(item, Boolean(value))"
                  />
                </td>
              </tr>
              <tr v-if="!scheduleDialogLoading && scheduleRows.length === 0">
                <td colspan="5" class="text-center text-medium-emphasis py-6">No schedule slots yet. Add your first slot above.</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="scheduleDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.doctors-nurse-page {
  display: grid;
  gap: 16px;
}
.hero-card {
  border-radius: 16px;
  border-color: #d7e4ff !important;
  background: linear-gradient(120deg, #f4f8ff 0%, #eef4ff 45%, #f8faff 100%);
}
.hero-kicker {
  display: inline-flex;
  margin-bottom: 10px;
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(47, 128, 237, 0.08);
  border: 1px solid rgba(47, 128, 237, 0.18);
  color: #2f5c9f;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
}
.stats-card {
  border-radius: 14px;
}
.stats-card :deep(.v-card-text) {
  padding: 14px 16px;
}
.stats-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: #5f6985;
  text-transform: uppercase;
}
.stats-value {
  margin-top: 6px;
  font-size: 30px;
  line-height: 1;
  font-weight: 800;
  color: #1f2a44;
}
.stats-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #6c748d;
}
.stats-card-total {
  background: linear-gradient(130deg, #f8fbff 0%, #eef5ff 100%);
  border-color: #dbe8ff !important;
}
.stats-card-doctor {
  background: linear-gradient(130deg, #f6f8ff 0%, #edf1ff 100%);
  border-color: #d7defd !important;
}
.stats-card-nurse {
  background: linear-gradient(130deg, #fff8f2 0%, #fff2e6 100%);
  border-color: #ffe0c5 !important;
}
.stats-card-present {
  background: linear-gradient(130deg, #f4fff7 0%, #eafff1 100%);
  border-color: #c8f4d7 !important;
}
</style>
