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
    date_of_birth: String!
    gender: String!
    profile_photo: String
    created_at: String!
  }

  type UserCommitteeAffiliationRelationalSnapshot {
    committee_id: Int!
    committee_name: String!
    logo: String
    is_committee_admin: Int!
  }

  type UserProgramOwnershipRelationalSnapshot {
    program_id: Int!
    program_name: String!
    status: String
    committee_id: Int!
  }

  type UserTaskKpiLineItemRelationalSnapshot {
    task_id: Int!
    task_title: String!
    status: String!
    due_date: String!
    priority: String!
  }

  type UserTasksKpiRelationalSummarySnapshot {
    total_assigned: Int!
    completed: Int!
    pending: Int!
    critical_overdue: Int!
    listing: [UserTaskKpiLineItemRelationalSnapshot!]!
  }

  type UserAssociationsRelationalAnalyticsSnapshot {
    committees: [UserCommitteeAffiliationRelationalSnapshot!]!
    programs_owned: [UserProgramOwnershipRelationalSnapshot!]!
  }

  type UserKpiMetricsRelationalAnalyticsSnapshot {
    tasks_summary: UserTasksKpiRelationalSummarySnapshot!
  }

  type UserRelationalAnalyticsByIdData {
    profile: UserProfileRelationalAnalyticsSnapshot!
    associations: UserAssociationsRelationalAnalyticsSnapshot!
    kpi_metrics: UserKpiMetricsRelationalAnalyticsSnapshot!
  }

  type UserRelationalAnalyticsByIdPayload {
    statusCode: Int!
    status: String!
    message: String!
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
          statusCode: 404,
          status: 'error',
          message: 'User analytics reference not found.',
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
         FROM committee_members cm
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
           FROM committee_members
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
        statusCode: 200,
        status: 'success',
        message: 'Relational user analytics synchronized successfully through GraphQL.',
        data: {
          profile: {
            id: userProfileSnapshot.id,
            name: userProfileSnapshot.name,
            email: userProfileSnapshot.email,
            mobile: userProfileSnapshot.mobile || '',
            date_of_birth: userProfileSnapshot.date_of_birth || '',
            gender: userProfileSnapshot.gender || '',
            profile_photo: userProfileSnapshot.profile_photo,
            created_at: userProfileSnapshot.created_at
          },
          associations: {
            committees: userCommitteeAffiliationSnapshotRows.map((row) => ({
              committee_id: Number(row.committee_id),
              committee_name: row.committee_name,
              logo: row.logo,
              is_committee_admin: Number(row.is_committee_admin)
            })),
            programs_owned: userProgramOwnershipSnapshotRows.map((row) => ({
              program_id: Number(row.program_id),
              program_name: row.program_name,
              status: row.status,
              committee_id: Number(row.committee_id)
            }))
          },
          kpi_metrics: {
            tasks_summary: {
              total_assigned: userTaskKpiLineItemRows.length,
              completed: completedTaskCount,
              pending: pendingTaskCount,
              critical_overdue: overdueTaskCount,
              listing: userTaskKpiLineItemRows.map((row) => ({
                task_id: Number(row.task_id),
                task_title: row.task_title,
                status: row.status || 'PENDING',
                due_date: row.due_date,
                priority: row.priority || 'NORMAL'
              }))
            }
          }
        }
      };
    }
  }
};
