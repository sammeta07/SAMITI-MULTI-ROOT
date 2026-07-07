// 1. Backend ko send hone wala direct payload interface
export interface CreateCommitteeRequest {
  name: string;
  establish_year: number;
  address: string;
  contact_numbers: string[];
  latitude: number;   // Location filters ke liye coordinates compulsory hain
  longitude: number;  // Location filters ke liye coordinates compulsory hain
}

// Alias for backward compatibility - Payload sent to backend
export interface CreateCommitteePayload {
  name: string;
  establish_year: number;
  address: string;
  contact_numbers: string[];
  latitude: number;
  longitude: number;
}

export interface UpdateCommitteePayload extends CreateCommitteePayload {
  committeeId: number;
}

// 2. GraphQL Response Data (Direct, without REST wrapper)
export interface CreateCommitteeApiResponse {
  id: number;
  committeeName: string;
  establishYear: number;
  address: string;
  contactNumbers: string[];
  latitude: number;
  longitude: number;
  createdBy: number;
  createdAt: string;
}

// Alias for backward compatibility
export type CreateCommitteeResponse = CreateCommitteeApiResponse;