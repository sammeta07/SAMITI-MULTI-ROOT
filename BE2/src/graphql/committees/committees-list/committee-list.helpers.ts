export interface EventSummaryRow {
  eventId: number;
  eventName: string;
  status: string;
  type: string | null;
  visibility: string;
  startDate: string | null;
  endDate: string | null;
  eventBanner: string | null;
}

export function parseContactNumbers(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }

  return [];
}

export function normalizeEventSummaryRow(event: any): EventSummaryRow {
  return {
    eventId: Number(event.eventId) || 0,
    eventName: String(event.eventName || event.name || '').trim(),
    status: String(event.status || 'UPCOMING'),
    type: event.type || null,
    visibility: String(event.visibility || 'VISIBLE'),
    startDate: event.startDate || null,
    endDate: event.endDate || null,
    eventBanner: event.eventBanner || null
  };
}
