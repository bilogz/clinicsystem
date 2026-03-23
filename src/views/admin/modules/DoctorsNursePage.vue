<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { fetchHrStaffDirectory, type HrStaffDirectoryRow } from '@/services/hrStaffRequests';

const loading = ref(false);
const rows = ref<HrStaffDirectoryRow[]>([]);
const meta = reactive({ page: 1, perPage: 10, total: 0, totalPages: 1 });

const roleFilter = ref<'all' | 'doctor' | 'nurse'>('all');
const statusFilter = ref<'all' | 'active' | 'working' | 'inactive'>('all');
const attendanceFilter = ref<'all' | 'present' | 'not_logged'>('all');
const search = ref('');
const page = ref(1);

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

watch([roleFilter, statusFilter], () => {
  page.value = 1;
  void loadDirectory();
});
watch(page, () => {
  void loadDirectory();
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
            </tr>
            <tr v-if="!loading && filteredRows.length === 0">
              <td colspan="6" class="text-center text-medium-emphasis py-6">No doctor/nurse records found.</td>
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
