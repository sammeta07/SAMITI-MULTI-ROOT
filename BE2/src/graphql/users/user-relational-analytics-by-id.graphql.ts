import { RowDataPacket } from 'mysql2/promise';
import { query } from '../../config/db';

type UserProfileSnapshotRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  date_of_birth: string | null;
  gender: string | null;
  profile_photo: string | null;
  created_at: string;
};

type UserCommitteeAffiliationSnapshotRow = RowDataPacket & {
  committee_id: number;
  committee_name: string;
  logo: string | null;
  is_committee_admin: number;
};

type UserProgramOwnershipSnapshotRow = RowDataPacket & {
  program_id: number;
  program_name: string;
  status: string | null;
  committee_id: number;
};

type UserTaskKpiLineItemRow = RowDataPacket & {
  task_id: number;
  task_title: string;
  status: string | null;
  due_date: string;
  priority: string | null;
};

export const userRelationalAnalyticsTypes = `
  type UserProfileRelationalAnalyticsSnapshot {
    id: Int!
    name: String!
    email: String!
    mobile: String!
    dateOfBirth: String!
    gender: String!
    profilePhoto: String
    createdAt: String!
  }

  type UserCommitteeAffiliationRelationalSnapshot {
    committeeId: Int!
    committeeName: String!
    logo: String
    isCommitteeAdmin: Int!
  }

  type UserProgramOwnershipRelationalSnapshot {
    programId: Int!
    programName: String!
    status: String
    committeeId: Int!
  }

  type UserTaskKpiLineItemRelationalSnapshot {
    taskId: Int!
    taskTitle: String!
    status: String!
    dueDate: String!
    priority: String!
  }

  type UserTasksKpiRelationalSummarySnapshot {
    totalAssigned: Int!
    completed: Int!
    pending: Int!
    criticalOverdue: Int!
    listing: [UserTaskKpiLineItemRelationalSnapshot!]!
  }

  type UserAssociationsRelationalAnalyticsSnapshot {
    committees: [UserCommitteeAffiliationRelationalSnapshot!]!
    programsOwned: [UserProgramOwnershipRelationalSnapshot!]!
  }

  type UserKpiMetricsRelationalAnalyticsSnapshot {
    tasksSummary: UserTasksKpiRelationalSummarySnapshot!
  }

  type UserRelationalAnalyticsByIdData {
    profile: UserProfileRelationalAnalyticsSnapshot!
    associations: UserAssociationsRelationalAnalyticsSnapshot!
    kpiMetrics: UserKpiMetricsRelationalAnalyticsSnapshot!
  }

  type UserRelationalAnalyticsByIdPayload {
    data: UserRelationalAnalyticsByIdData
  }
`;

export const userRelationalAnalyticsQueryFields = `
  userRelationalAnalyticsByUserId(userId: Int!, committeeId: Int): UserRelationalAnalyticsByIdPayload!
`;

function resolveAccessTokenFromContextHeadersOrCookies(context: any): string {
  const authorizationHeader = context.headers?.authorization;
  const tokenFromCookie = context.cookies?.token;

  if (authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
    return authorizationHeader.slice(7);
  }

  if (tokenFromCookie) {
    return tokenFromCookie;
  }

  throw new Error('Unauthorized: Missing access token');
}

async function ensureAuthenticatedUserIdFromContext(context: any): Promise<number> {
  const accessToken = resolveAccessTokenFromContextHeadersOrCookies(context);
  const decodedTokenPayload: any = await context.jwt.verify(accessToken);
  const authenticatedUserId = Number(decodedTokenPayload?.id || decodedTokenPayload?.user_id || decodedTokenPayload?.uid);

  if (!authenticatedUserId) {
    throw new Error('Unauthorized: Invalid token');
  }

  return authenticatedUserId;
}

export const userRelationalAnalyticsResolvers = {
  Query: {
    async userRelationalAnalyticsByUserId(
      _: unknown,
      args: { userId: number; committeeId?: number | null },
      context: any
    ) {
      await ensureAuthenticatedUserIdFromContext(context);

      const { userId } = args;

      const userProfileRows = await query<UserProfileSnapshotRow[]>(
        `SELECT
          id,
          name,
          email,
          mobile,
          date_of_birth,
          gender,
          profile_photo,
          created_at
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
      );

      if (userProfileRows.length === 0) {
        return {
          data: null
        };
      }

      const userProfileSnapshot = userProfileRows[0];

      const userCommitteeAffiliationSnapshotRows = await query<UserCommitteeAffiliationSnapshotRow[]>(
        `SELECT
          c.id AS committee_id,
          c.committee_name,
          c.logo,
          cm.is_committee_admin
         FROM users_committees cm
         INNER JOIN committees c ON cm.committee_id = c.id
         WHERE cm.user_id = ?
           AND cm.membership_status = 'ACCEPTED'`,
        [userId]
      );

      const userProgramOwnershipSnapshotRows = await query<UserProgramOwnershipSnapshotRow[]>(
        `SELECT
          p.id AS program_id,
          p.program_name,
          p.status,
          e.committee_id
         FROM programs p
         INNER JOIN events e ON p.event_id = e.id
         WHERE e.committee_id IN (
           SELECT committee_id
           FROM users_committees
           WHERE user_id = ? AND is_committee_admin = 1
         )`,
        [userId]
      ).catch(() => []);

      const userTaskKpiLineItemRows = await query<UserTaskKpiLineItemRow[]>(
        `SELECT
          id AS task_id,
          title AS task_title,
          status,
          created_at AS due_date,
          'NORMAL' AS priority
         FROM tasks
         WHERE owner_id = ?`,
        [userId]
      ).catch(() => []);

      const completedTaskCount = userTaskKpiLineItemRows.filter((row) => row.status === 'COMPLETED').length;
      const pendingTaskCount = userTaskKpiLineItemRows.filter((row) => row.status === 'PENDING' || row.status === 'ACTIVE').length;
      const overdueTaskCount = userTaskKpiLineItemRows.filter(
        (row) => row.status !== 'COMPLETED' && new Date(row.due_date) < new Date()
      ).length;

      return {
        data: {
          profile: {
            id: userProfileSnapshot.id,
            name: userProfileSnapshot.name,
            email: userProfileSnapshot.email,
            mobile: userProfileSnapshot.mobile || '',
            dateOfBirth: userProfileSnapshot.date_of_birth || '',
            gender: userProfileSnapshot.gender || '',
            profilePhoto: userProfileSnapshot.profile_photo,
            createdAt: userProfileSnapshot.created_at
          },
          associations: {
            committees: userCommitteeAffiliationSnapshotRows.map((row) => ({
              committeeId: Number(row.committee_id),
              committeeName: row.committee_name,
              logo: row.logo,
              isCommitteeAdmin: Number(row.is_committee_admin)
            })),
            programsOwned: userProgramOwnershipSnapshotRows.map((row) => ({
              programId: Number(row.program_id),
              programName: row.program_name,
              status: row.status,
              committeeId: Number(row.committee_id)
            }))
          },
          kpiMetrics: {
            tasksSummary: {
              totalAssigned: userTaskKpiLineItemRows.length,
              completed: completedTaskCount,
              pending: pendingTaskCount,
              criticalOverdue: overdueTaskCount,
              listing: userTaskKpiLineItemRows.map((row) => ({
                taskId: Number(row.task_id),
                taskTitle: row.task_title,
                status: row.status || 'PENDING',
                dueDate: row.due_date,
                priority: row.priority || 'NORMAL'
              }))
            }
          }
        }
      };
    }
  }
};
