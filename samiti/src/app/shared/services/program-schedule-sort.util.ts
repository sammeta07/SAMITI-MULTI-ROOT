import { getEventComputedStatus } from './event-status.util';

export interface ProgramScheduleSortable {
  name?: string | null;
  programName?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
}

function normalizeDate(value: string | null | undefined): string | null {
  const date = value?.slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function timeInSeconds(value: string | null | undefined): number | null {
  const match = value?.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function compareOptional<T extends string | number>(left: T | null | undefined, right: T | null | undefined): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  return left < right ? -1 : 1;
}

export function compareByScheduleAndStatus(
  left: ProgramScheduleSortable,
  right: ProgramScheduleSortable
): number {
  const statusOrder = {
    COMPLETED: 0,
    STARTED: 1,
    UPCOMING: 2
  } as const;
  const leftStatus = statusOrder[getEventComputedStatus(left.startDate, left.endDate)];
  const rightStatus = statusOrder[getEventComputedStatus(right.startDate, right.endDate)];

  if (leftStatus !== rightStatus) {
    return leftStatus - rightStatus;
  }

  const scheduleComparisons = [
    compareOptional(normalizeDate(left.startDate), normalizeDate(right.startDate)),
    compareOptional(timeInSeconds(left.startTime), timeInSeconds(right.startTime)),
    compareOptional(normalizeDate(left.endDate), normalizeDate(right.endDate)),
    compareOptional(timeInSeconds(left.endTime), timeInSeconds(right.endTime))
  ];

  const scheduleComparison = scheduleComparisons.find((comparison) => comparison !== 0);
  if (scheduleComparison !== undefined) {
    return scheduleComparison;
  }

  const leftName = left.programName ?? left.name ?? '';
  const rightName = right.programName ?? right.name ?? '';
  return leftName.localeCompare(rightName, undefined, { sensitivity: 'base', numeric: true });
}
