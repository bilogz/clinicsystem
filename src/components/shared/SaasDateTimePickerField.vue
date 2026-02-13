<script setup lang="ts">
import { computed, ref, watch } from 'vue';

type PickerMode = 'date' | 'time' | 'datetime';

const props = withDefaults(
  defineProps<{
    modelValue: string | null | undefined;
    label: string;
    mode?: PickerMode;
    errorMessages?: string | string[];
    density?: 'default' | 'comfortable' | 'compact';
    disabled?: boolean;
    min?: string;
    max?: string;
    clearable?: boolean;
    hideDetails?: boolean | 'auto';
  }>(),
  {
    mode: 'date',
    density: 'comfortable',
    disabled: false,
    min: '',
    max: '',
    clearable: false,
    hideDetails: false
  }
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const dialog = ref(false);
const tab = ref<'date' | 'time'>('date');
const draftDate = ref('');
const draftTime = ref('');

function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const raw = String(value).trim();
  const fromIso = raw.includes('T') ? raw.split('T')[0] : raw;
  return /^\d{4}-\d{2}-\d{2}$/.test(fromIso) ? fromIso : '';
}

function toTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const raw = String(value).trim();
  const fromIso = raw.includes('T') ? raw.split('T')[1] : raw;
  const candidate = fromIso.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(candidate) ? candidate : '';
}

function hydrateDraft(): void {
  draftDate.value = toDateInput(props.modelValue);
  draftTime.value = toTimeInput(props.modelValue);
  tab.value = props.mode === 'time' ? 'time' : 'date';
}

watch(
  () => props.modelValue,
  () => {
    if (!dialog.value) hydrateDraft();
  },
  { immediate: true }
);

watch(
  () => dialog.value,
  (opened) => {
    if (opened) hydrateDraft();
  }
);

const displayValue = computed(() => {
  if (props.mode === 'date') {
    return draftDate.value;
  }
  if (props.mode === 'time') {
    return draftTime.value;
  }
  if (!draftDate.value && !draftTime.value) return '';
  return `${draftDate.value || '---- -- --'} ${draftTime.value || '--:--'}`;
});

const pickerTitle = computed(() => {
  if (props.mode === 'date') return 'Select Date';
  if (props.mode === 'time') return 'Select Time';
  return 'Select Date & Time';
});

const pickerSummary = computed(() => {
  if (props.mode === 'date') return draftDate.value || 'No date selected';
  if (props.mode === 'time') return draftTime.value || 'No time selected';
  return `${draftDate.value || 'No date'} • ${draftTime.value || 'No time'}`;
});

function clearValue(): void {
  draftDate.value = '';
  draftTime.value = '';
  emit('update:modelValue', '');
}

function applySelection(): void {
  if (props.mode === 'date') {
    emit('update:modelValue', draftDate.value || '');
    dialog.value = false;
    return;
  }
  if (props.mode === 'time') {
    emit('update:modelValue', draftTime.value || '');
    dialog.value = false;
    return;
  }
  if (!draftDate.value && !draftTime.value) {
    emit('update:modelValue', '');
    dialog.value = false;
    return;
  }
  emit('update:modelValue', `${draftDate.value || ''}T${draftTime.value || '00:00'}`);
  dialog.value = false;
}
</script>

<template>
  <div class="saas-picker-field">
    <v-text-field
      :model-value="displayValue"
      :label="label"
      variant="outlined"
      :density="density"
      :error-messages="errorMessages"
      :disabled="disabled"
      :hide-details="hideDetails"
      readonly
      :prepend-inner-icon="mode === 'time' ? 'mdi-clock-time-four-outline' : 'mdi-calendar-month-outline'"
      @click="dialog = true"
    >
      <template #append-inner>
        <v-btn
          v-if="clearable && !disabled && displayValue"
          icon="mdi-close-circle-outline"
          variant="text"
          size="x-small"
          class="text-medium-emphasis mr-1"
          @click.stop="clearValue"
        />
        <v-icon icon="mdi-chevron-down" class="text-medium-emphasis" />
      </template>
    </v-text-field>

    <v-dialog v-model="dialog" max-width="460" transition="scale-transition">
      <v-card class="saas-picker-card">
        <v-card-item class="saas-picker-head">
          <v-card-title class="text-h6">{{ pickerTitle }}</v-card-title>
          <v-card-subtitle>{{ pickerSummary }}</v-card-subtitle>
        </v-card-item>

        <v-card-text class="pt-4">
          <template v-if="mode === 'date'">
            <v-date-picker v-model="draftDate" :min="min || undefined" :max="max || undefined" color="primary" elevation="0" />
          </template>

          <template v-else-if="mode === 'time'">
            <v-time-picker v-model="draftTime" color="primary" elevation="0" format="24hr" />
          </template>

          <template v-else>
            <v-tabs v-model="tab" density="comfortable" color="primary" class="mb-3">
              <v-tab value="date">Date</v-tab>
              <v-tab value="time">Time</v-tab>
            </v-tabs>
            <v-window v-model="tab">
              <v-window-item value="date">
                <v-date-picker v-model="draftDate" :min="min || undefined" :max="max || undefined" color="primary" elevation="0" />
              </v-window-item>
              <v-window-item value="time">
                <v-time-picker v-model="draftTime" color="primary" elevation="0" format="24hr" />
              </v-window-item>
            </v-window>
          </template>
        </v-card-text>

        <v-card-actions class="px-5 pb-5">
          <v-btn variant="text" @click="dialog = false">Cancel</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" class="px-5" @click="applySelection">Apply</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped lang="scss">
.saas-picker-card {
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  box-shadow: 0 20px 60px rgba(16, 24, 40, 0.22);
  border-radius: 18px;
  overflow: hidden;
  animation: saasPickerPop 220ms ease;
}

.saas-picker-head {
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.12), rgba(var(--v-theme-secondary), 0.08));
}

:deep(.v-picker) {
  background: transparent;
}

:deep(.v-time-picker-clock__inner),
:deep(.v-time-picker-clock) {
  background: linear-gradient(170deg, rgba(var(--v-theme-primary), 0.08), rgba(var(--v-theme-secondary), 0.06));
}

@keyframes saasPickerPop {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
