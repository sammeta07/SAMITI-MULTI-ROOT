export interface MyDesignation {
  roleId: number | null;
  name: string | null;
  color: string | null;
  icon: string | null;
}

export interface EventOverviewMeta {
  id: number;
  eventId: number;
  eventName: string;
  eventDisplayName: string;
  myDesignation?: MyDesignation | null;
  committeeRole?: string;
}

export interface EventOverviewPayload extends EventOverviewMeta {
  bannerImages: string[];
}

export interface EventDetailsHeaderPayload {
  id: number;
  eventId: number;
  committeeId?: number | null;
  committeeAddress?: string | null;
  eventName: string;
  eventDisplayName: string;
  eventLogo?: string | null;
  category?: string | null;
  eventYear?: number | null;
  type?: 'PUBLIC' | 'PRIVATE' | string;
  startDate?: string | null;
  endDate?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  myDesignation?: MyDesignation | null;
  committeeRole?: string;
}
