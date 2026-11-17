// Calendar events (Stage 7; reference CalendarEventType).

export const CALENDAR_EVENT_TYPES = [
  'holiday',
  'closure',
  'special_day',
  'assembly',
  'activity',
  'parent_meeting',
  'appointment',
  'examination',
  'other',
] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

// The events that shut the campus (or a section): no registers, no cover.
export const CLOSING_EVENT_TYPES: readonly CalendarEventType[] = [
  'holiday',
  'closure',
];

// "2026-11-10T09:30" in the campus's own time, as events are entered.
export function wallTime(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((one) => one.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
