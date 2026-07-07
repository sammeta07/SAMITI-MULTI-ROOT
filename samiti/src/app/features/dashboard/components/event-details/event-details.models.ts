export interface EventPerson {
  id: number;
  name: string;
  email: string;
  photo?: string | null;
}

export interface EventDetailsPayload {
  id: number;
  eventId: number;
  committeeId?: number | null;
  committeeAddress?: string | null;
  eventName: string;
  eventDisplayName: string;
  eventBanner?: string | null;
  bannerImages: string[];
  status: string;
  category?: string | null;
  visibility: string;
  type?: 'PUBLIC' | 'PRIVATE' | string;
  startDate?: string | null;
  endDate?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdBy: number;
  updatedBy?: number | null;
  createdAt?: string | null;
}