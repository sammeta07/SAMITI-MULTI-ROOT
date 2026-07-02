// ============================================================================
// 1. Account Update Payload Interface
// ============================================================================
export interface AccountUpdatePayload {
  name: string;
  mobile: string;
  photo?: string;
}

// ============================================================================
// 2. Account Update Response Interface (GraphQL Response)
// ============================================================================
export interface AccountUpdateResponse {
  userId: number;
  name: string;
  email: string;
  mobile: string;
  photo?: string;
}
