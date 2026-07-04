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

type LoginCommitteeRoleRow = RowDataPacket & {
  committee_id: number;
  committee_name: string;
  is_committee_admin: number | null;
  is_committee_member: number | null;
  membership_status: string | null;
  admin_status: string | null;
};

type LoginEventRoleRow = RowDataPacket & {
  event_id: number;
  event_name: string;
  committee_id: number | null;
  designation: string | null;
  status: string | null;
};

type LoginProgramRoleRow = RowDataPacket & {
  program_id: number;
  program_name: string;
  event_id: number | null;
  event_name: string | null;
};

type LoginTaskRoleRow = RowDataPacket & {
  task_id: number;
  task_name: string;
  event_id: number | null;
  parent_id: number | null;
  status: string | null;
  owner_id: number | null;
  event_member_user_id: number | null;
};

export const loginTypes = `
  type LoginDashboardTreeNode {
    id: String!
    name: String!
    type: String!
    roles: [String!]!
    status: String
    children: [LoginDashboardTreeNode!]!
  }

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
    dashboardTree: [LoginDashboardTreeNode!]!
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

      const committeeRoleRows = await query<LoginCommitteeRoleRow[]>(
        `SELECT
          c.id AS committee_id,
          c.committee_name,
          cm.is_committee_admin,
          cm.is_committee_member,
          cm.membership_status,
          cm.admin_status
         FROM users_committees cm
         INNER JOIN committees c ON c.id = cm.committee_id
         WHERE cm.user_id = ?
           AND (
             COALESCE(cm.is_committee_admin, 0) = 1
             OR COALESCE(cm.is_committee_member, 0) = 1
             OR UPPER(COALESCE(cm.membership_status, '')) = 'ACCEPTED'
             OR UPPER(COALESCE(cm.admin_status, '')) = 'ACCEPTED'
           )`,
        [user.id]
      ).catch(() => []);

      const eventRoleRows = await query<LoginEventRoleRow[]>(
        `SELECT
          e.id AS event_id,
          e.name AS event_name,
          e.committee_id,
          em.designation,
          em.status
         FROM event_members em
         INNER JOIN events e ON e.id = em.event_id
         WHERE em.user_id = ?`,
        [user.id]
      ).catch(() => []);

      const programRoleRows = await query<LoginProgramRoleRow[]>(
        `SELECT
          p.id AS program_id,
          p.name AS program_name,
          p.event_id,
          e.name AS event_name
         FROM programs p
         INNER JOIN events e ON e.id = p.event_id
         WHERE e.created_by = ?`,
        [user.id]
      ).catch(() => []);

      const taskRoleRows = await query<LoginTaskRoleRow[]>(
        `SELECT
          t.id AS task_id,
          t.name AS task_name,
          t.event_id,
          t.parent_id,
          t.status,
          t.owner_id,
          em.user_id AS event_member_user_id
         FROM tasks t
         LEFT JOIN event_members em
           ON em.event_id = t.event_id
          AND em.user_id = ?
         WHERE t.owner_id = ?
            OR em.user_id IS NOT NULL`,
        [user.id, user.id]
      ).catch(() => []);

      type InternalTreeNode = {
        id: string;
        name: string;
        type: string;
        roles: Set<string>;
        status: string | null;
        children: InternalTreeNode[];
        childIds: Set<string>;
      };

      const rootNodes: InternalTreeNode[] = [];
      const rootNodeIds = new Set<string>();
      const committeeNodeById = new Map<number, InternalTreeNode>();
      const eventNodeById = new Map<number, InternalTreeNode>();

      const attachRoot = (node: InternalTreeNode) => {
        if (!rootNodeIds.has(node.id)) {
          rootNodes.push(node);
          rootNodeIds.add(node.id);
        }
      };

      const attachChild = (parentNode: InternalTreeNode, childNode: InternalTreeNode) => {
        if (!parentNode.childIds.has(childNode.id)) {
          parentNode.children.push(childNode);
          parentNode.childIds.add(childNode.id);
        }
      };

      for (const row of committeeRoleRows) {
        const committeeId = Number(row.committee_id);
        const existingNode = committeeNodeById.get(committeeId);
        const committeeNode = existingNode || {
          id: `committee_${committeeId}`,
          name: String(row.committee_name),
          type: 'COMMITTEE',
          roles: new Set<string>(),
          status: row.membership_status || row.admin_status || null,
          children: [],
          childIds: new Set<string>()
        };

        if (row.is_committee_admin) {
          committeeNode.roles.add('ADMIN');
        }
        if (row.is_committee_member) {
          committeeNode.roles.add('MEMBER');
        }

        committeeNodeById.set(committeeId, committeeNode);
        attachRoot(committeeNode);
      }

      for (const row of eventRoleRows) {
        const eventId = Number(row.event_id);
        const existingNode = eventNodeById.get(eventId);
        const eventNode = existingNode || {
          id: `event_${eventId}`,
          name: String(row.event_name),
          type: 'EVENT',
          roles: new Set<string>(),
          status: row.status || null,
          children: [],
          childIds: new Set<string>()
        };

        if (row.designation && String(row.designation).trim()) {
          eventNode.roles.add(String(row.designation).trim().toUpperCase());
        } else {
          eventNode.roles.add('MEMBER');
        }

        eventNodeById.set(eventId, eventNode);

        const committeeId = row.committee_id ? Number(row.committee_id) : null;
        if (committeeId && committeeNodeById.has(committeeId)) {
          attachChild(committeeNodeById.get(committeeId)!, eventNode);
        } else {
          attachRoot(eventNode);
        }
      }

      for (const row of programRoleRows) {
        const programNode: InternalTreeNode = {
          id: `program_${Number(row.program_id)}`,
          name: String(row.program_name),
          type: 'PROGRAM',
          roles: new Set<string>(['OWNER']),
          status: null,
          children: [],
          childIds: new Set<string>()
        };

        const eventId = row.event_id ? Number(row.event_id) : null;
        if (eventId && eventNodeById.has(eventId)) {
          attachChild(eventNodeById.get(eventId)!, programNode);
        } else {
          attachRoot(programNode);
        }
      }

      for (const row of taskRoleRows) {
        const isOwner = Number(row.owner_id) === Number(user.id);
        const taskNode: InternalTreeNode = {
          id: `task_${Number(row.task_id)}`,
          name: String(row.task_name),
          type: 'TASK',
          roles: new Set<string>([isOwner ? 'OWNER' : 'ASSIGNED']),
          status: row.status || null,
          children: [],
          childIds: new Set<string>()
        };

        const eventId = row.event_id ? Number(row.event_id) : null;
        if (eventId && eventNodeById.has(eventId)) {
          attachChild(eventNodeById.get(eventId)!, taskNode);
        } else {
          attachRoot(taskNode);
        }
      }

      const serializeNode = (node: InternalTreeNode): {
        id: string;
        name: string;
        type: string;
        roles: string[];
        status: string | null;
        children: any[];
      } => ({
        id: node.id,
        name: node.name,
        type: node.type,
        roles: Array.from(node.roles),
        status: node.status,
        children: node.children.map((childNode) => serializeNode(childNode))
      });

      const dashboardTree = rootNodes.map((rootNode) => serializeNode(rootNode));

      const baseRoleSet = new Set<string>();
      const rawBaseRoleValue = String(user.base_role || '').trim();
      if (rawBaseRoleValue) {
        for (const role of rawBaseRoleValue.split(',').map((roleValue) => roleValue.trim()).filter(Boolean)) {
          baseRoleSet.add(role);
        }
      }
      baseRoleSet.add('AUTH_USER');
      if (dashboardTree.length > 0) {
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
        secure: process.env.NODE_ENV === 'production', // Only secure on production (HTTPS)
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
        },
        dashboardTree
      };
    }
  }
};
