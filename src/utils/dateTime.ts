type DateTimeInput = Date | string | number | null | undefined;

type DateTimeFormatOptions = Intl.DateTimeFormatOptions & {
  fallback?: string;
};

export const APP_TIME_ZONE = 'Asia/Manila';
export const APP_TIME_ZONE_LABEL = 'GMT+8';

function normalizeDateTimeInput(value: DateTimeInput): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);

  const text = String(value || '').trim();
  if (!text) return new Date('');

  const normalizedText =
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(text)
      ? text
      : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/i.test(text)
        ? text.replace(' ', 'T') + 'Z'
        : text;

  return new Date(normalizedText);
}

export function getTimezoneLabel(value: DateTimeInput = new Date()): string {
  const parsed = normalizeDateTimeInput(value ?? Date.now());
  if (Number.isNaN(parsed.getTime())) return 'GMT';
  return APP_TIME_ZONE_LABEL;
}

export function formatDateTimeWithTimezone(
  value: DateTimeInput,
  options: DateTimeFormatOptions = {}
): string {
  const parsed = normalizeDateTimeInput(value);
  if (Number.isNaN(parsed.getTime())) return options.fallback || String(value || '--');

  const { fallback: _fallback, ...formatOptions } = options;
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
    ...formatOptions
  });

  return `${formatter.format(parsed)} ${getTimezoneLabel(parsed)}`;
}
