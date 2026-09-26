export type EventComputedStatus = 'UPCOMING' | 'STARTED' | 'COMPLETED';

function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

export function getEventComputedStatus(startDate: string | null | undefined, endDate: string | null | undefined): EventComputedStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  if (end && end.getTime() < today.getTime()) return 'COMPLETED';
  if (start && start.getTime() <= today.getTime()) return 'STARTED';
  return 'UPCOMING';
}
