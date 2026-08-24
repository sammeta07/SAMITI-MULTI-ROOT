import { RowDataPacket } from 'mysql2/promise';
import { execute, query } from '../../config/db';
import { deleteLocalMediaFileIfExists } from '../../media/image-cleanup';
import { isCloudinaryStorageEnabled } from '../../media/cloudinary-storage';

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
    data: AccountData!
  }

  input UpdateAccountInput {
    name: String!
    mobile: String!
    photo: String
  }

  type UserAccountRole {
    committeeId: Int!
    committeeName: String!
    committeeLogo: String
    committeeRole: String!
    roleLabel: String!
    events: [UserAccountEventRole!]!
  }

  type UserAccountEventRole {
    eventId: Int!
    eventName: String!
    committeeId: Int!
    committeeName: String!
    committeeLogo: String
    designation: String!
    membershipStatus: String!
    eventStatus: String
    eventVisibility: String
  }

  type UserAccountRolesPayload {
    committees: [UserAccountRole!]!
  }
`;

export const accountQueryFields = `
  userAccountRoles: UserAccountRolesPayload!
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
    async userAccountRoles(_: unknown, __: unknown, context: any) {
      const loggedInUserId = await getLoggedInUserId(context);

      const committeeRoleRows = await query(
        `SELECT
          c.id AS committee_id,
          c.committee_name,
          c.logo AS committee_logo,
          cm.committee_role
         FROM users_committees cm
         INNER JOIN committees c ON c.id = cm.committee_id
         WHERE cm.user_id = ?
           AND cm.committee_role IN ('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
         ORDER BY c.committee_name ASC`,
        [loggedInUserId]
      ).catch(() => []);

      const eventRoleRows = await query(
        `SELECT
          e.id AS event_id,
          e.name AS event_name,
          c.id AS committee_id,
          c.committee_name,
          c.logo AS committee_logo,
          UPPER(COALESCE(NULLIF(TRIM(ue.designation), ''), 'MEMBER')) AS designation,
          UPPER(COALESCE(NULLIF(TRIM(ue.status), ''), 'ACTIVE')) AS membership_status,
          e.status AS event_status,
          e.visibility AS event_visibility
         FROM users_events ue
         INNER JOIN events e ON e.id = ue.event_id
         INNER JOIN committees c ON c.id = e.committee_id
         WHERE ue.user_id = ?
           AND e.voting_phase_state = 6
         ORDER BY c.committee_name ASC, e.name ASC`,
        [loggedInUserId]
      ).catch(() => []);

      const eventsByCommitteeId = new Map<number, typeof eventRoleRows>();
      for (const row of eventRoleRows) {
        const cid = Number(row.committee_id);
        const list = eventsByCommitteeId.get(cid) || [];
        list.push(row);
        eventsByCommitteeId.set(cid, list);
      }

      return {
        committees: committeeRoleRows.map((row) => {
          const cid = Number(row.committee_id);
          const committeeEvents = (eventsByCommitteeId.get(cid) || []).map((ev) => {
            const eid = Number(ev.event_id);
            const usersEventsDesignation = String(ev.designation || '').trim().toUpperCase();
            const designation = usersEventsDesignation || 'MEMBER';
            return {
              eventId: eid,
              eventName: ev.event_name,
              committeeId: cid,
              committeeName: ev.committee_name,
              committeeLogo: ev.committee_logo || null,
              designation,
              membershipStatus: ev.membership_status || 'ACTIVE',
              eventStatus: ev.event_status || null,
              eventVisibility: ev.event_visibility || null
            };
          });

          return {
            committeeId: cid,
            committeeName: row.committee_name,
            committeeLogo: row.committee_logo || null,
            committeeRole: row.committee_role || 'COMMITTEE_MEMBER',
            roleLabel: String(row.committee_role || 'COMMITTEE_MEMBER')
              .replace(/^COMMITTEE_/, '')
              .replace(/_/g, ' ')
              .toLowerCase()
              .replace(/\b\w/g, (ch) => ch.toUpperCase()),
            events: committeeEvents
          };
        })
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

      // In Cloudinary mode the profile photo is uploaded with a fixed public id
      // (user-profile-<id>) and overwrites the previous asset, so the old photo is
      // already replaced. In local mode each upload gets a unique filename, so we
      // must delete the previous file to avoid orphaned storage.
      if (
        !isCloudinaryStorageEnabled() &&
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
