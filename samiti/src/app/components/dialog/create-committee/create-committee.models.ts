// 1. Backend ko send hone wala direct payload interface
export interface CreateCommitteeRequest {
  name: string;
  since: number;
  area: string;
  contact_numbers: string[];
  description: string;
  latitude: number;   // Location filters ke liye coordinates compulsory hain
  longitude: number;  // Location filters ke liye coordinates compulsory hain
  logo: string | null; // 🚀 Added: Direct integration parameter standard
}

// Alias for backward compatibility - Payload sent to backend
export interface CreateCommitteePayload {
  name: string;
  since: number;
  area: string;
  contact_numbers: string[];
  description: string;
  latitude: number;
  longitude: number;
  logo: string | null; // 🚀 Added
}

export interface UpdateCommitteePayload extends CreateCommitteePayload {
  committeeId: number;
}

// 2. GraphQL Response Data (Direct, without REST wrapper)
export interface CreateCommitteeApiResponse {
  id: number;
  committeeName: string;
  since: number;
  area: string;
  contactNumbers: string[];
  description: string;
  latitude: number;
  longitude: number;
  logo: string | null;
  createdBy: number;
  createdAt: string;
}

// Alias for backward compatibility
export type CreateCommitteeResponse = CreateCommitteeApiResponse;