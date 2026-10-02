export type ProgramLifecycleStatus = 'UPCOMING' | 'STARTED' | 'COMPLETED';

function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function getProgramLifecycleStatus(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): ProgramLifecycleStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  if (end && end.getTime() < today.getTime()) return 'COMPLETED';
  if (start && start.getTime() <= today.getTime()) return 'STARTED';
  return 'UPCOMING';
}