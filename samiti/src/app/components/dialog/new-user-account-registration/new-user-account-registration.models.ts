// ── New User Account Registration Feature Models ─────────────────────────

export interface NewUserAccountRegistrationPayload {
    name: string;
    email: string;
    mobile: string;
    gender: string;
    dateOfBirth: string;
    password: string;
    profilePhoto?: string | null;
    fcmToken?: string | null;
    baseRole?: string;
}

export interface NewUserAccountRegistrationResponse {
  id: number;
  email: string;
  name: string;
  mobile: string;
  dateOfBirth: string;
  gender: string;
  baseRole: string | null;
  profilePhoto: string | null;
  fcmToken: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
