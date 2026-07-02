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

// 2. Standard Universal API Response right after creation
export interface CreateCommitteeApiResponse {
  statusCode: number;
  status: 'success' | string;
  message: string;
  data: {
    id: number;
    committee_code: string; // Automatic generated code by server e.g. "RBC_12"
    name: string;
    since: number;
    area: string;
    contact_numbers: string[];
    description: string;
    logo: string | null;
    distance: number;       // Initially 0 or calculated based on user cords
    is_favourite: boolean;  // Default false
    created_at: string;
    created_by: number;
  };
}

// Alias for backward compatibility
export type CreateCommitteeResponse = CreateCommitteeApiResponse;