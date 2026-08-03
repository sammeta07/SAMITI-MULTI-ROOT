export interface EventOverviewMeta {
  id: number;
  eventId: number;
  committeeId?: number | null;
  committeeAddress?: string | null;
  eventName: string;
  eventDisplayName: string;
  eventBanner?: string | null;
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

export interface EventOverviewPayload extends EventOverviewMeta {
  bannerImages: string[];
}
