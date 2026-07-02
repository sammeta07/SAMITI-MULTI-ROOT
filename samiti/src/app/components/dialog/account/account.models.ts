// ============================================================================
// 1. Account Update Payload Interface
// ============================================================================
export interface AccountUpdatePayload {
  name: string;
  mobile: string;
  photo?: string;
}

// ============================================================================
// 2. Account Update Response Interface
// ============================================================================
export interface AccountUpdateResponse {
  statusCode: number;
  status: 'success';
  message: string;
  data: {
    user_id: number;
    name: string;
    email: string;
    mobile: string;
    photo?: string;
  };
}
