export interface CreateEventPayload {
  committeeId: number;
  eventName: string;
  eventDisplayName?: string;
  description?: string;
  eventBanner?: string;
  bannerImageUrls?: string[];
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  type?: string;
  visibility: 'VISIBLE' | 'HIDDEN';
  startDate: string | null;
  endDate: string | null;
}

export interface CreateEventResponse {
  id: number;
  eventId: number;
  eventName: string;
  eventDisplayName: string;
  committeeId: number;
  description?: string;
  eventBanner?: string;
  bannerImages: string[];
  status: string;
  type?: string;
  visibility: string;
  startDate: string | null;
  endDate: string | null;
  createdBy: number;
  updatedBy: number;
  createdAt: string;
}
