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
  eventName: string;
  eventDisplayName: string;
  description?: string | null;
  eventBanner?: string | null;
  bannerImages: string[];
  status: string;
  type?: string | null;
  visibility: string;
  startDate?: string | null;
  endDate?: string | null;
  createdBy: number;
  updatedBy?: number | null;
  createdAt?: string | null;
}