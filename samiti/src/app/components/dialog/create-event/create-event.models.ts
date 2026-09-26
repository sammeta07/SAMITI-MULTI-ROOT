export interface CreateEventPayload {
  committeeId: number;
  eventName: string;
  eventDisplayName?: string;
  address?: string;
  eventBanner?: string;
  bannerImageUrls?: string[];
  category?: string;
  visibility: 'VISIBLE' | 'HIDDEN';
  type: 'PUBLIC' | 'PRIVATE';
  eventYear: number;
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
  address?: string;
  eventBanner?: string;
  bannerImages: string[];
  category?: string;
  visibility: string;
  type: 'PUBLIC' | 'PRIVATE';
  eventYear: number;
  startDate: string | null;
  endDate: string | null;
  latitude: number;
  longitude: number;
  createdBy: number;
  updatedBy: number;
  createdAt: string;
}

export interface UpdateEventPayload extends CreateEventPayload {
  eventId: number;
}

export interface UpdateEventResponse {
  id: number;
  eventId: number;
  eventName: string;
  eventDisplayName: string;
  committeeId: number;
  address?: string;
  eventBanner?: string;
  bannerImages: string[];
  category?: string;
  visibility: string;
  type: 'PUBLIC' | 'PRIVATE';
  eventYear: number;
  startDate: string | null;
  endDate: string | null;
  latitude: number;
  longitude: number;
  createdBy: number;
  updatedBy: number;
  createdAt: string;
}
