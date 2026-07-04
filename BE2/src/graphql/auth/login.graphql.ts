import { RowDataPacket } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { query } from '../../config/db';

type LoginUserRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  date_of_birth: string | null;
  gender: string | null;
  mobile: string | null;
  password: string | null;
  base_role: string | null;
  profile_photo: string | null;
  fcm_token: string | null;
  provider: string | null;
  provider_id: string | null;
  status: string | null;
  is_verified: number | null;
  email_verified_at: string | null;
  deleted_at: string | null;
};

type CountRow = RowDataPacket & {
  total_count: number;
};

export const loginTypes = `
  type LoginUserData {
    id: Int!
    name: String!
    email: String!
    dateOfBirth: String
    gender: String
    mobile: String
    baseRole: [String!]!
    profilePhoto: String
    fcmToken: String
    provider: String
    providerId: String
    status: String
    isVerified: Boolean
    emailVerifiedAt: String
    deletedAt: String
  }

  type LoginPayload {
    token: String!
    user: LoginUserData!
  }
`;

export const loginMutationFields = `
  login(email: String!, password: String!, fcmToken: String): LoginPayload!
`;

export const loginResolvers = {
  Mutation: {
    async login(_: any, args: { email: string; password: string; fcmToken?: string }, context: any) {
      const { email, password, fcmToken = null } = args;

      if (!email) {
        throw new Error('Email is required for login.');
      }

      const users = await query<LoginUserRow[]>(
        'SELECT id, name, email, date_of_birth, gender, mobile, password, base_role, profile_photo, fcm_token, provider, provider_id, status, is_verified, email_verified_at, deleted_at FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
        [email.trim().toLowerCase()]
      );

      if (users.length === 0) {
        throw new Error('Invalid email or password.');
      }

      const user = users[0];

      const hasSocialProvider = Boolean(
        user.provider && String(user.provider).trim() && user.provider_id && String(user.provider_id).trim()
      );

      if (hasSocialProvider) {
        throw new Error('This account is configured for social login. Please continue with your social provider.');
      }

      if (!password || !String(password).trim()) {
        throw new Error('Password is required for login.');
      }

      const isPasswordValid = await bcrypt.compare(String(password), String(user.password));
      if (!isPasswordValid) {
        throw new Error('Invalid email or password.');
      }

      if (user.status && String(user.status).toLowerCase() !== 'active') {
        throw new Error('User account is not active.');
      }

      if (fcmToken) {
        await query('UPDATE users SET fcm_token = ?, updated_at = NOW() WHERE id = ?', [fcmToken, user.id]);
      }

      const [committeeCountRows, eventCountRows, programCountRows, taskCountRows] = await Promise.all([
        query<CountRow[]>(
          `SELECT COUNT(*) AS total_count
           FROM users_committees
           WHERE user_id = ?
             AND (
               COALESCE(is_committee_admin, 0) = 1
               OR COALESCE(is_committee_member, 0) = 1
             )`,
          [user.id]
        ).catch(() => [{ total_count: 0 } as CountRow]),
        query<CountRow[]>(
          `SELECT COUNT(*) AS total_count
           FROM users_events
           WHERE user_id = ?`,
          [user.id]
        ).catch(() => [{ total_count: 0 } as CountRow]),
        query<CountRow[]>(
          `SELECT COUNT(*) AS total_count
           FROM programs p
           INNER JOIN events e ON e.id = p.event_id
           WHERE e.created_by = ?`,
          [user.id]
        ).catch(() => [{ total_count: 0 } as CountRow]),
        query<CountRow[]>(
          `SELECT COUNT(*) AS total_count
           FROM tasks
           WHERE owner_id = ?`,
          [user.id]
        ).catch(() => [{ total_count: 0 } as CountRow])
      ]);

      const hasDashboardAccess =
        Number(committeeCountRows[0]?.total_count || 0) > 0 ||
        Number(eventCountRows[0]?.total_count || 0) > 0 ||
        Number(programCountRows[0]?.total_count || 0) > 0 ||
        Number(taskCountRows[0]?.total_count || 0) > 0;

      const baseRoleSet = new Set<string>();
      const rawBaseRoleValue = String(user.base_role || '').trim();
      if (rawBaseRoleValue) {
        for (const role of rawBaseRoleValue.split(',').map((roleValue) => roleValue.trim()).filter(Boolean)) {
          baseRoleSet.add(role);
        }
      }
      baseRoleSet.add('AUTH_USER');
      if (hasDashboardAccess) {
        baseRoleSet.add('DASHBOARD_USER');
      }

      const sessionToken = context.jwt.sign({
        id: user.id,
        name: user.name,
        email: user.email,
        base_role: user.base_role || 'USER'
      });

      context.reply.setCookie('token', sessionToken, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60
      });

      return {
        token: sessionToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          dateOfBirth: user.date_of_birth || null,
          gender: user.gender || null,
          mobile: user.mobile || null,
          baseRole: Array.from(baseRoleSet),
          profilePhoto: user.profile_photo || null,
          fcmToken: fcmToken || user.fcm_token || null,
          provider: user.provider,
          providerId: user.provider_id,
          status: user.status,
          isVerified: Boolean(user.is_verified),
          emailVerifiedAt: user.email_verified_at,
          deletedAt: user.deleted_at
        }
      };
    }
  }
};
