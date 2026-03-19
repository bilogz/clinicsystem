import { computed, onMounted, onUnmounted, ref } from 'vue';
import { formatDateTimeWithTimezone, getTimezoneLabel } from '@/utils/dateTime';

export function toLocalInputDateTime(value: Date | string | null | undefined = new Date()): string {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function useRealtimeClock(intervalMs = 1000) {
  const now = ref(new Date());
  let timer: ReturnType<typeof setInterval> | null = null;

  const update = (): void => {
    now.value = new Date();
  };

  const dateText = computed(() =>
    new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(now.value)
  );

  const timeText = computed(() =>
    `${new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }).format(now.value)} ${getTimezoneLabel(now.value)}`
  );

  const compactDateTimeText = computed(() =>
    formatDateTimeWithTimezone(now.value, {
      weekday: 'short'
    })
  );

  const timezoneLabel = computed(() => getTimezoneLabel(now.value));

  const localInputNow = computed(() => toLocalInputDateTime(now.value));

  onMounted(() => {
    update();
    timer = setInterval(update, intervalMs);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return {
    now,
    dateText,
    timeText,
    compactDateTimeText,
    timezoneLabel,
    localInputNow,
    update
  };
}
