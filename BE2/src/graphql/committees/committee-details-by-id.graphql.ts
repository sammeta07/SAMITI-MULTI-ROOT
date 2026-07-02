import { query } from '../../config/db';

export const committeeDetailsTypes = `
  type CommitteeMember {
    id: Int!
    name: String!
    email: String!
    isCommitteeAdmin: Int!
  }

  type CommitteeDetailsData {
    id: Int!
    committeeId: Int!
    committeeName: String!
    description: String!
    address: String!
    establishYear: Int!
    logo: String
    contactNumbers: [String!]!
    createdBy: Int!
    createdAt: String!
    isLoggedUserAdmin: Boolean!
    loggedInUserAdminStatus: String
    loggedInUserAdminStatusActionBy: Int
    loggedInUserAdminStatusActionAt: String
    members: [CommitteeMember!]!
  }
`;

export const committeeDetailsQueryFields = `
    committeeDetails(id: Int!): CommitteeDetailsData!
`;

export const committeeDetailsResolvers = {
  Query: {
    async committeeDetails(_: any, args: { id: number }, context: any) {
      const { id: committeeId } = args;

      const authHeader = context.headers?.authorization;
      const tokenFromCookie = context.cookies?.token;
      let accessToken: string | null = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      } else if (tokenFromCookie) {
        accessToken = tokenFromCookie;
      }

      if (!accessToken) {
        throw new Error('Unauthorized: Missing access token');
      }

      const decoded: any = await context.jwt.verify(accessToken);
      const loggedInUserId = Number(decoded?.id || decoded?.user_id || decoded?.uid);
      if (!loggedInUserId) {
        throw new Error('Unauthorized: Invalid token');
      }

      // Fetch committee details
      const committeeResult = await query<any[]>(`
        SELECT 
          id,
          committee_name,
          description,
          address,
          establish_year,
          logo,
          contact_numbers,
          created_by,
          created_at
        FROM committees
        WHERE id = ?
      `, [committeeId]);

      if (!committeeResult || committeeResult.length === 0) {
        throw new Error(`Committee with ID ${committeeId} not found`);
      }

      const committee = committeeResult[0];

      // Check if logged-in user is admin of this committee
      const adminCheckResult = await query<any[]>(`
        SELECT
          is_committee_admin,
          admin_status,
          admin_status_action_by,
          admin_status_action_at
        FROM committee_members
        WHERE committee_id = ? AND user_id = ?
      `, [committeeId, loggedInUserId]);

      const isLoggedUserAdmin = adminCheckResult && adminCheckResult.length > 0 && Number(adminCheckResult[0].is_committee_admin) === 1;
      const loggedInUserMembershipRow = adminCheckResult && adminCheckResult.length > 0 ? adminCheckResult[0] : null;
      const loggedInUserAdminStatus = isLoggedUserAdmin
        ? 'ACCEPTED'
        : (loggedInUserMembershipRow?.admin_status ? String(loggedInUserMembershipRow.admin_status).toUpperCase() : null);
      const loggedInUserAdminStatusActionBy = loggedInUserMembershipRow?.admin_status_action_by
        ? Number(loggedInUserMembershipRow.admin_status_action_by)
        : null;
      const loggedInUserAdminStatusActionAt = loggedInUserMembershipRow?.admin_status_action_at || null;

      // Fetch all members of the committee
      const members = await query<any[]>(`
        SELECT 
          u.id,
          u.name,
          u.email,
          COALESCE(cm.is_committee_admin, 0) AS is_committee_admin
        FROM users u
        INNER JOIN committee_members cm ON u.id = cm.user_id
        WHERE cm.committee_id = ? AND cm.membership_status = 'ACCEPTED'
        ORDER BY u.name ASC
      `, [committeeId]);

      return {
        id: committee.id,
        committeeId: committee.id,
        committeeName: committee.committee_name,
        description: committee.description,
        address: committee.address,
        establishYear: committee.establish_year,
        logo: committee.logo || null,
        contactNumbers: typeof committee.contact_numbers === 'string' ? JSON.parse(committee.contact_numbers) : (committee.contact_numbers || []),
        createdBy: committee.created_by,
        createdAt: committee.created_at,
        isLoggedUserAdmin,
        loggedInUserAdminStatus,
        loggedInUserAdminStatusActionBy,
        loggedInUserAdminStatusActionAt,
        members: members.map((m: any) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          isCommitteeAdmin: Number(m.is_committee_admin)
        }))
      };
    }
  }
};
