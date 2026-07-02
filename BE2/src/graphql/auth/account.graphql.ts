import { RowDataPacket } from 'mysql2/promise';
import { execute, query } from '../../config/db';
import { deleteLocalMediaFileIfExists } from '../../media/image-cleanup';

const MOBILE_PATTERN = /^\d{10}$/;

type AccountRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  profile_photo: string | null;
  provider: string | null;
  provider_id: string | null;
  status: string | null;
  is_verified: number | null;
  email_verified_at: string | null;
  deleted_at: string | null;
};

export const accountTypes = `
  type AccountData {
    userId: Int!
    name: String!
    email: String!
    mobile: String!
    photo: String
    provider: String
    providerId: String
    status: String
    isVerified: Boolean
    emailVerifiedAt: String
    deletedAt: String
  }

  type AccountPayload {
    statusCode: Int!
    status: String!
    message: String!
    data: AccountData!
  }

  input UpdateAccountInput {
    name: String!
    mobile: String!
    photo: String
  }
`;

export const accountQueryFields = `
  myAccount: AccountPayload!
`;

export const accountMutationFields = `
  updateAccount(input: UpdateAccountInput!): AccountPayload!
`;

function getAccessToken(context: any): string {
  const authHeader = context.headers?.authorization;
  const tokenFromCookie = context.cookies?.token;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  if (tokenFromCookie) {
    return tokenFromCookie;
  }

  throw new Error('Unauthorized: Missing access token');
}

async function getLoggedInUserId(context: any): Promise<number> {
  const accessToken = getAccessToken(context);
  const decoded: any = await context.jwt.verify(accessToken);
  const loggedInUserId = Number(decoded?.id || decoded?.user_id || decoded?.uid);

  if (!loggedInUserId) {
    throw new Error('Unauthorized: Invalid token');
  }

  return loggedInUserId;
}

async function fetchAccountPayloadByUserId(userId: number): Promise<AccountRow> {
  const rows = await query<AccountRow[]>(
    'SELECT id, name, email, mobile, profile_photo, provider, provider_id, status, is_verified, email_verified_at, deleted_at FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [userId]
  );

  const account = rows[0];
  if (!account) {
    throw new Error('User not found');
  }

  return account;
}

export const accountResolvers = {
  Query: {
    async myAccount(_: unknown, __: unknown, context: any) {
      const loggedInUserId = await getLoggedInUserId(context);
      const account = await fetchAccountPayloadByUserId(loggedInUserId);

      return {
        statusCode: 200,
        status: 'success',
        message: 'Account loaded successfully',
        data: {
          userId: account.id,
          name: account.name,
          email: account.email,
          mobile: account.mobile || '',
          photo: account.profile_photo,
          provider: account.provider,
          providerId: account.provider_id,
          status: account.status,
          isVerified: Boolean(account.is_verified),
          emailVerifiedAt: account.email_verified_at,
          deletedAt: account.deleted_at
        }
      };
    }
  },
  Mutation: {
    async updateAccount(
      _: unknown,
      args: { input: { name: string; mobile: string; photo?: string | null } },
      context: any
    ) {
      const loggedInUserId = await getLoggedInUserId(context);
      const { name, mobile, photo } = args.input;

      if (!name?.trim() || !mobile?.trim()) {
        throw new Error('Name and mobile are required');
      }

      const normalizedMobile = mobile.trim();
      if (!MOBILE_PATTERN.test(normalizedMobile)) {
        throw new Error('Mobile number must be exactly 10 digits.');
      }

      const existingAccount = await fetchAccountPayloadByUserId(loggedInUserId);
      const normalizedIncomingPhoto = typeof photo === 'string' && photo.trim() ? photo.trim() : null;
      const nextProfilePhotoUrl = normalizedIncomingPhoto ?? existingAccount.profile_photo;

      await execute(
        `UPDATE users
         SET name = ?,
             mobile = ?,
             profile_photo = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [name.trim(), normalizedMobile, nextProfilePhotoUrl, loggedInUserId]
      );

      if (
        normalizedIncomingPhoto &&
        existingAccount.profile_photo &&
        existingAccount.profile_photo !== normalizedIncomingPhoto
      ) {
        try {
          await deleteLocalMediaFileIfExists(existingAccount.profile_photo);
        } catch (cleanupError) {
          // Best-effort cleanup: profile update should succeed even if file deletion fails.
          console.warn('Failed to remove old profile photo from local storage:', cleanupError);
        }
      }

      const updatedAccount = await fetchAccountPayloadByUserId(loggedInUserId);

      return {
        statusCode: 200,
        status: 'success',
        message: 'Account updated successfully',
        data: {
          userId: updatedAccount.id,
          name: updatedAccount.name,
          email: updatedAccount.email,
          mobile: updatedAccount.mobile || '',
          photo: updatedAccount.profile_photo
        }
      };
    }
  }
};
