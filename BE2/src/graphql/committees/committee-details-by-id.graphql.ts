import { query } from '../../config/db';

const normalizeContactNumbers = (rawContactNumbers: unknown): string[] => {
  if (Array.isArray(rawContactNumbers)) {
    return rawContactNumbers
      .map((contact) => String(contact).trim())
      .filter((contact) => contact.length > 0);
  }

  if (typeof rawContactNumbers === 'string') {
    try {
      const parsed = JSON.parse(rawContactNumbers);
      if (Array.isArray(parsed)) {
        return parsed
          .map((contact) => String(contact).trim())
          .filter((contact) => contact.length > 0);
      }
    } catch {
      return rawContactNumbers.trim() ? [rawContactNumbers.trim()] : [];
    }
  }

  return [];
};

export const committeeDetailsTypes = `
  type CommitteeMember {
    id: Int!
    name: String!
    email: String!
    photo: String
    committeeRole: String
    isCommitteeAdmin: Int!
  }

  type CommitteeDetailsData {
    id: Int!
    committeeId: Int!
    committeeName: String!
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

      // Check if logged-in user is admin + latest admin request status
      const adminCheckResult = await query<any[]>(`
        SELECT committee_role FROM users_committees
        WHERE committee_id = ? AND user_id = ?
        LIMIT 1
      `, [committeeId, loggedInUserId]);

      const isLoggedUserAdmin =
        adminCheckResult.length > 0 &&
        (String(adminCheckResult[0].committee_role || '') === 'COMMITTEE_ADMIN' ||
          String(adminCheckResult[0].committee_role || '') === 'COMMITTEE_MASTER_ADMIN');

      // Latest admin role request for this user
      const adminRequestRow = await query<any[]>(`
        SELECT status, action_by_user_id, action_at
        FROM committee_role_requests
        WHERE committee_id = ? AND requester_user_id = ? AND request_role = 'COMMITTEE_ADMIN'
        ORDER BY requested_at DESC
        LIMIT 1
      `, [committeeId, loggedInUserId]);

      const loggedInUserAdminStatus = isLoggedUserAdmin
        ? 'ACCEPTED'
        : (adminRequestRow.length > 0 ? String(adminRequestRow[0].status).toUpperCase() : null);
      const loggedInUserAdminStatusActionBy = adminRequestRow.length > 0 && adminRequestRow[0].action_by_user_id
        ? Number(adminRequestRow[0].action_by_user_id)
        : null;
      const loggedInUserAdminStatusActionAt = adminRequestRow.length > 0 ? adminRequestRow[0].action_at || null : null;

      // Fetch all members of the committee
      const members = await query<any[]>(`
        SELECT 
          u.id,
          u.name,
          u.email,
          u.profile_photo,
          cm.committee_role,
          CASE WHEN cm.committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN') THEN 1 ELSE 0 END AS is_committee_admin
        FROM users u
        INNER JOIN users_committees cm ON u.id = cm.user_id
        WHERE cm.committee_id = ? AND cm.committee_role IN ('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
        ORDER BY u.name ASC
      `, [committeeId]);

      return {
        id: committee.id,
        committeeId: committee.id,
        committeeName: committee.committee_name,
        address: committee.address,
        establishYear: committee.establish_year,
        logo: committee.logo || null,
        contactNumbers: normalizeContactNumbers(committee.contact_numbers),
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
          photo: m.profile_photo || null,
          committeeRole: m.committee_role || null,
          isCommitteeAdmin: Number(m.is_committee_admin)
        }))
      };
    }
  }
};
