import bcrypt from 'bcrypt';
import { RowDataPacket } from 'mysql2/promise';
import { execute, query } from '../../config/db';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE_PATTERN = /^\d{10}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
const ALLOWED_GENDERS = new Set(['male', 'female', 'other']);
const PASSWORD_RULE_MESSAGE = 'Password must be 8-64 chars and include letters and numbers. Example: Abcd1234';

type ExistingUserRow = RowDataPacket & {
  id: number;
};

type RegisteredUserRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  date_of_birth: string | null;
  gender: string | null;
  base_role: string | null;
  profile_photo: string | null;
  fcm_token: string | null;
  provider: string | null;
  provider_id: string | null;
  status: string | null;
  is_verified: number | null;
  email_verified_at: string | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function buildRegistrationResult(createdUser: RegisteredUserRow) {
  return {
    statusCode: 200,
    message: 'New user registration successful.',
    data: {
      id: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      mobile: createdUser.mobile,
      dateOfBirth: createdUser.date_of_birth,
      gender: createdUser.gender,
      baseRole: createdUser.base_role,
      profilePhoto: createdUser.profile_photo,
      fcmToken: createdUser.fcm_token,
      provider: createdUser.provider,
      providerId: createdUser.provider_id,
      status: createdUser.status,
      isVerified: Boolean(createdUser.is_verified),
      emailVerifiedAt: createdUser.email_verified_at,
      deletedAt: createdUser.deleted_at,
      createdAt: createdUser.created_at,
      updatedAt: createdUser.updated_at
    }
  };
}

type RegistrationInput = {
  name: string;
  email: string;
  mobile: string;
  dateOfBirth: string;
  gender: string;
  password?: string | null;
  profilePhoto?: string | null;
  fcmToken?: string | null;
  baseRole?: string | null;
  provider?: string | null;
  providerId?: string | null;
};

async function registerUser(input: RegistrationInput) {
  const {
    name,
    email,
    mobile,
    dateOfBirth,
    gender,
    password,
    profilePhoto = null,
    fcmToken = null,
    baseRole = 'AUTH_USER',
    provider = null,
    providerId = null
  } = input;

  const normalizedName = name.trim().replace(/\s+/g, ' ');
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedMobile = mobile.trim();
  const normalizedGender = gender.trim().toLowerCase();
  const normalizedProfilePhoto = typeof profilePhoto === 'string' && profilePhoto.trim() ? profilePhoto.trim() : null;
  const normalizedFcmToken = typeof fcmToken === 'string' && fcmToken.trim() ? fcmToken.trim() : null;
  const normalizedBaseRole = typeof baseRole === 'string' && baseRole.trim() ? baseRole.trim().toUpperCase() : 'AUTH_USER';
  const normalizedProvider = typeof provider === 'string' && provider.trim() ? provider.trim().toLowerCase() : null;
  const normalizedProviderId = typeof providerId === 'string' && providerId.trim() ? providerId.trim() : null;
  const normalizedPassword = typeof password === 'string' ? password.trim() : '';
  const normalizedDateOfBirth = dateOfBirth.trim();
  const parsedDateOfBirth = new Date(normalizedDateOfBirth);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!normalizedName || !normalizedEmail || !normalizedMobile || !normalizedDateOfBirth || !normalizedGender) {
    throw new Error('All required registration fields must be provided.');
  }

  const isSocialRegistration = Boolean(normalizedProvider || normalizedProviderId);

  if (isSocialRegistration && (!normalizedProvider || !normalizedProviderId)) {
    throw new Error('Both provider and providerId are required for social registration.');
  }

  if (!isSocialRegistration && !normalizedPassword) {
    throw new Error('Password is required for non-social registration.');
  }

  if (!isSocialRegistration && !PASSWORD_PATTERN.test(normalizedPassword)) {
    throw new Error(PASSWORD_RULE_MESSAGE);
  }

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw new Error('Please provide a valid email address.');
  }

  if (!MOBILE_PATTERN.test(normalizedMobile)) {
    throw new Error('Mobile number must be exactly 10 digits.');
  }

  if (!ALLOWED_GENDERS.has(normalizedGender)) {
    throw new Error('Please select a valid gender option.');
  }

  if (Number.isNaN(parsedDateOfBirth.getTime())) {
    throw new Error('Please provide a valid date of birth.');
  }

  const dobCandidate = new Date(parsedDateOfBirth);
  dobCandidate.setHours(0, 0, 0, 0);

  if (dobCandidate > today) {
    throw new Error('Date of birth cannot be in the future.');
  }

  const existingEmailUser = await query<ExistingUserRow[]>(
    'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
    [normalizedEmail]
  );

  if (existingEmailUser.length > 0) {
    throw new Error('Email already registered.');
  }

  const existingMobileUser = await query<ExistingUserRow[]>(
    'SELECT id FROM users WHERE mobile = ? AND deleted_at IS NULL LIMIT 1',
    [normalizedMobile]
  );

  if (existingMobileUser.length > 0) {
    throw new Error('Mobile number already registered.');
  }

  if (normalizedProvider && normalizedProviderId) {
    const existingProviderUser = await query<ExistingUserRow[]>(
      'SELECT id FROM users WHERE provider = ? AND provider_id = ? AND deleted_at IS NULL LIMIT 1',
      [normalizedProvider, normalizedProviderId]
    );

    if (existingProviderUser.length > 0) {
      throw new Error('Social account already registered.');
    }
  }

  const hashedPassword = !isSocialRegistration ? await bcrypt.hash(normalizedPassword, 10) : null;
  const storedPassword = isSocialRegistration ? null : hashedPassword;
  const storedEmailVerifiedAt = isSocialRegistration ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
  const storedIsVerified = isSocialRegistration ? 1 : 0;

  const insertResult = await execute(
    `INSERT INTO users (
      name,
      email,
      password,
      mobile,
      date_of_birth,
      gender,
      base_role,
      profile_photo,
      fcm_token,
      provider,
      provider_id,
      status,
      is_verified,
      email_verified_at,
      deleted_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      normalizedName,
      normalizedEmail,
      storedPassword,
      normalizedMobile,
      normalizedDateOfBirth,
      normalizedGender,
      normalizedBaseRole,
      normalizedProfilePhoto,
      normalizedFcmToken,
      normalizedProvider,
      normalizedProviderId,
      'active',
      storedIsVerified,
      storedEmailVerifiedAt,
      null
    ]
  );

  const createdUsers = await query<RegisteredUserRow[]>(
    'SELECT id, name, email, mobile, date_of_birth, gender, base_role, profile_photo, fcm_token, provider, provider_id, status, is_verified, email_verified_at, deleted_at, created_at, updated_at FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [insertResult.insertId]
  );

  const createdUser = createdUsers[0];

  if (!createdUser) {
    throw new Error('Registration succeeded but user could not be loaded.');
  }

  return buildRegistrationResult(createdUser);
}

export const newUserRegistrationTypes = `
  type NewUserRegistrationData {
    id: Int!
    name: String!
    email: String!
    mobile: String
    dateOfBirth: String
    gender: String
    baseRole: String
    profilePhoto: String
    fcmToken: String
    provider: String
    providerId: String
    status: String
    isVerified: Boolean
    emailVerifiedAt: String
    deletedAt: String
    createdAt: String
    updatedAt: String
  }

  type NewUserRegistrationPayload {
    statusCode: Int!
    message: String!
    data: NewUserRegistrationData!
  }

  input NewUserRegistrationInput {
    name: String!
    email: String!
    mobile: String!
    dateOfBirth: String!
    gender: String!
    password: String
    profilePhoto: String
    fcmToken: String
    baseRole: String
    provider: String
    providerId: String
  }

  type NewUserAccountRegistrationData {
    id: Int!
    name: String!
    email: String!
    mobile: String
    dateOfBirth: String
    gender: String
    baseRole: String
    profilePhoto: String
    fcmToken: String
    provider: String
    providerId: String
    status: String
    isVerified: Boolean
    emailVerifiedAt: String
    deletedAt: String
    createdAt: String
    updatedAt: String
  }

  type NewUserAccountRegistrationPayload {
    statusCode: Int!
    message: String!
    data: NewUserAccountRegistrationData!
  }

  type NewUserRegistrationValidationPayload {
    statusCode: Int!
    isValid: Boolean!
    message: String!
  }

  input NewUserAccountRegistrationInput {
    name: String!
    email: String!
    mobile: String!
    dateOfBirth: String!
    gender: String!
    password: String
    profilePhoto: String
    fcmToken: String
    baseRole: String
    provider: String
    providerId: String
  }
`;

export const newUserRegistrationMutationFields = `
  submitNewUserRegistration(input: NewUserRegistrationInput!): NewUserRegistrationPayload!
  submitNewUserAccountRegistration(input: NewUserAccountRegistrationInput!): NewUserAccountRegistrationPayload!
  validateNewUserAccountRegistration(input: NewUserAccountRegistrationInput!): NewUserRegistrationValidationPayload!
`;

export const newUserRegistrationResolvers = {
  Mutation: {
    async submitNewUserRegistration(
      _: unknown,
      args: { input: RegistrationInput }
    ) {
      return registerUser(args.input);
    },

    async submitNewUserAccountRegistration(
      _: unknown,
      args: { input: RegistrationInput }
    ) {
      return registerUser(args.input);
    },

    async validateNewUserAccountRegistration(
      _: unknown,
      args: { input: RegistrationInput }
    ) {
      const {
        name,
        email,
        mobile,
        dateOfBirth,
        gender,
        password,
        provider = null,
        providerId = null
      } = args.input;

      const normalizedName = name.trim().replace(/\s+/g, ' ');
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedMobile = mobile.trim();
      const normalizedGender = gender.trim().toLowerCase();
      const normalizedProvider = typeof provider === 'string' && provider.trim() ? provider.trim().toLowerCase() : null;
      const normalizedProviderId = typeof providerId === 'string' && providerId.trim() ? providerId.trim() : null;
      const normalizedPassword = typeof password === 'string' ? password.trim() : '';
      const normalizedDateOfBirth = dateOfBirth.trim();
      const parsedDateOfBirth = new Date(normalizedDateOfBirth);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (!normalizedName || !normalizedEmail || !normalizedMobile || !normalizedDateOfBirth || !normalizedGender) {
        throw new Error('All required registration fields must be provided.');
      }

      const isSocialRegistration = Boolean(normalizedProvider || normalizedProviderId);

      if (isSocialRegistration && (!normalizedProvider || !normalizedProviderId)) {
        throw new Error('Both provider and providerId are required for social registration.');
      }

      if (!isSocialRegistration && !normalizedPassword) {
        throw new Error('Password is required for non-social registration.');
      }

      if (!isSocialRegistration && !PASSWORD_PATTERN.test(normalizedPassword)) {
        throw new Error(PASSWORD_RULE_MESSAGE);
      }

      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        throw new Error('Please provide a valid email address.');
      }

      if (!MOBILE_PATTERN.test(normalizedMobile)) {
        throw new Error('Mobile number must be exactly 10 digits.');
      }

      if (!ALLOWED_GENDERS.has(normalizedGender)) {
        throw new Error('Please select a valid gender option.');
      }

      if (Number.isNaN(parsedDateOfBirth.getTime())) {
        throw new Error('Please provide a valid date of birth.');
      }

      const dobCandidate = new Date(parsedDateOfBirth);
      dobCandidate.setHours(0, 0, 0, 0);

      if (dobCandidate > today) {
        throw new Error('Date of birth cannot be in the future.');
      }

      const existingEmailUser = await query<ExistingUserRow[]>(
        'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
        [normalizedEmail]
      );

      if (existingEmailUser.length > 0) {
        throw new Error('Email already registered.');
      }

      const existingMobileUser = await query<ExistingUserRow[]>(
        'SELECT id FROM users WHERE mobile = ? AND deleted_at IS NULL LIMIT 1',
        [normalizedMobile]
      );

      if (existingMobileUser.length > 0) {
        throw new Error('Mobile number already registered.');
      }

      if (normalizedProvider && normalizedProviderId) {
        const existingProviderUser = await query<ExistingUserRow[]>(
          'SELECT id FROM users WHERE provider = ? AND provider_id = ? AND deleted_at IS NULL LIMIT 1',
          [normalizedProvider, normalizedProviderId]
        );

        if (existingProviderUser.length > 0) {
          throw new Error('Social account already registered.');
        }
      }

      return {
        statusCode: 200,
        isValid: true,
        message: 'Validation successful.'
      };
    }
  }
};