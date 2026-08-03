export interface EventPerson {
  id: number;
  name: string;
  email: string;
  photo?: string | null;
}

export interface EventParticipant {
  userId: number;
  name: string;
  email: string;
  photo?: string | null;
  designation: string;
  membershipStatus: string;
}

export interface EventPeoplePayload {
  eventParticipants: EventParticipant[];
}
