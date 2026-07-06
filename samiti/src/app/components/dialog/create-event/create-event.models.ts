export interface CreateEventPayload {
  committeeId: number;
  eventName: string;
  eventDisplayName?: string;
  description?: string;
  address?: string;
  eventBanner?: string;
  bannerImageUrls?: string[];
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  category?: string;
  visibility: 'VISIBLE' | 'HIDDEN';
  startDate: string | null;
  endDate: string | null;
  latitude: number;
  longitude: number;
}

export interface CreateEventResponse {
  id: number;
  eventId: number;
  eventName: string;
  eventDisplayName: string;
  committeeId: number;
  description?: string;
  address?: string;
  eventBanner?: string;
  bannerImages: string[];
  status: string;
  category?: string;
  visibility: string;
  startDate: string | null;
  endDate: string | null;
  latitude: number;
  longitude: number;
  createdBy: number;
  updatedBy: number;
  createdAt: string;
}
