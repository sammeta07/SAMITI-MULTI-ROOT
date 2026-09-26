export interface EventSummaryRow {
  eventId: number;
  eventName: string;
  eventYear: number;
  category: string | null;
  address: string | null;
  eventLogo: string | null;
  latitude: number | null;
  longitude: number | null;
  startDate: string | null;
  endDate: string | null;
  bannerImages: string[];
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
    eventYear: Number(event.eventYear) || 0,
    category: event.category || null,
    address: event.address || null,
    eventLogo: event.eventLogo || null,
    latitude: event.latitude === null || event.latitude === undefined ? null : Number(event.latitude),
    longitude: event.longitude === null || event.longitude === undefined ? null : Number(event.longitude),
    startDate: event.startDate || null,
    endDate: event.endDate || null,
    bannerImages: Array.isArray(event.bannerImages) ? event.bannerImages : []
  };
}
