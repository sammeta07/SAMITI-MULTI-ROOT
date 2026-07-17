import { query } from '../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { hasEventsDisplayNameColumn } from '../events/event-display-name-support';

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

const normalizeEventDisplayName = (eventName: string, displayName: string | null, supportsDisplayName: boolean): string => {
  if (supportsDisplayName && typeof displayName === 'string' && displayName.trim().length > 0) {
    return displayName.trim();
  }

  return eventName.slice(0, 20);
};

const getCommitteeAvailableRoles = async (): Promise<Array<{
  roleId: number | null;
  roleName: string;
  roleCode: string | null;
  hindiName: string | null;
  englishName: string | null;
}>> => {
  const candidateTables = ['events_roles_master', 'event_roles_master'];

  for (const tableName of candidateTables) {
    const tableRows = await query<Array<RowDataPacket & { tableName: string }>>(
      `SELECT TABLE_NAME AS tableName
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
       LIMIT 1`,
      [tableName]
    );

    if (!tableRows.length) {
      continue;
    }

    const columnRows = await query<Array<RowDataPacket & { columnName: string }>>(
      `SELECT COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?`,
      [tableName]
    );

    const availableColumns = new Set(columnRows.map((row) => String(row.columnName || '').toLowerCase()));

    const roleIdExpr = availableColumns.has('role_id')
      ? 'role_id'
      : availableColumns.has('id')
        ? 'id'
        : 'NULL';

    const roleNameExpr = availableColumns.has('role_name')
      ? 'role_name'
      : availableColumns.has('name')
        ? 'name'
        : `'Unknown'`;

    const roleCodeExpr = availableColumns.has('role_code') ? 'role_code' : 'NULL';
    const hindiNameExpr = availableColumns.has('hindi_name') ? 'hindi_name' : 'NULL';
    const englishNameExpr = availableColumns.has('english_name') ? 'english_name' : 'NULL';
    const sortOrderExpr = availableColumns.has('sort_order') ? 'sort_order' : '0';

    const isActiveExpr = availableColumns.has('is_active') ? 'is_active = 1' : '1 = 1';

    const roleRows = await query<Array<RowDataPacket>>(
      `SELECT
         ${roleIdExpr} AS roleId,
         ${roleNameExpr} AS roleName,
         ${roleCodeExpr} AS roleCode,
         ${hindiNameExpr} AS hindiName,
         ${englishNameExpr} AS englishName,
         ${sortOrderExpr} AS sortOrder
       FROM ${tableName}
       WHERE ${isActiveExpr}
       ORDER BY CAST(${sortOrderExpr} AS UNSIGNED) ASC, ${roleNameExpr} ASC`,
      []
    );

    return roleRows.map((roleRow) => ({
      roleId: roleRow.roleId != null ? Number(roleRow.roleId) : null,
      roleName: String(roleRow.roleName || 'Unknown'),
      roleCode: roleRow.roleCode != null ? String(roleRow.roleCode) : null,
      hindiName: roleRow.hindiName != null ? String(roleRow.hindiName) : null,
      englishName: roleRow.englishName != null ? String(roleRow.englishName) : null
    }));
  }

  return [];
};

const getEventMappedVotingRoles = async (eventId: number, loggedInUserId: number): Promise<Array<{
  roleId: number;
  roleName: string;
  hindiName: string | null;
  englishName: string | null;
  sortOrder: number;
  nominationCount: number;
  isNominatedByCurrentUser: boolean;
  nominees: Array<{ userId: number; name: string; email: string; photo: string | null }>;
}>> => {
  const mappedRoleRows = await query<Array<RowDataPacket & {
    roleId: number;
    roleName: string;
    hindiName: string | null;
    englishName: string | null;
    sortOrder: number;
    nominationCount: number;
    isNominatedByCurrentUser: number;
  }>>(
    `SELECT
        evr.role_id AS roleId,
        erm.role_name AS roleName,
        erm.hindi_name AS hindiName,
        erm.english_name AS englishName,
        COALESCE(erm.sort_order, 0) AS sortOrder,
        COALESCE(nc.nominationCount, 0) AS nominationCount,
        CASE WHEN myNom.user_id IS NULL THEN 0 ELSE 1 END AS isNominatedByCurrentUser
      FROM event_voting_roles evr
      INNER JOIN events_roles_master erm ON erm.role_id = evr.role_id
      LEFT JOIN (
        SELECT role_id, COUNT(*) AS nominationCount
        FROM event_voting_role_nominations
        WHERE event_id = ?
        GROUP BY role_id
      ) nc ON nc.role_id = evr.role_id
      LEFT JOIN event_voting_role_nominations myNom
        ON myNom.event_id = evr.event_id
       AND myNom.role_id = evr.role_id
       AND myNom.user_id = ?
      WHERE evr.event_id = ?
      ORDER BY COALESCE(erm.sort_order, 0) ASC, erm.role_name ASC`,
    [eventId, loggedInUserId, eventId]
  );

  const nomineeRows = await query<Array<RowDataPacket & {
    roleId: number;
    userId: number;
    name: string;
    email: string;
    photo: string | null;
  }>>(
    `SELECT
        evrn.role_id AS roleId,
        u.id AS userId,
        u.name AS name,
        u.email AS email,
        u.profile_photo AS photo
      FROM event_voting_role_nominations evrn
      INNER JOIN users u ON u.id = evrn.user_id
      WHERE evrn.event_id = ?
      ORDER BY evrn.role_id ASC, u.name ASC`,
    [eventId]
  );

  const nomineesByRoleId = new Map<number, Array<{ userId: number; name: string; email: string; photo: string | null }>>();
  for (const nomineeRow of nomineeRows) {
    const normalizedRoleId = Number(nomineeRow.roleId);
    const bucket = nomineesByRoleId.get(normalizedRoleId) || [];
    bucket.push({
      userId: Number(nomineeRow.userId),
      name: String(nomineeRow.name || ''),
      email: String(nomineeRow.email || ''),
      photo: nomineeRow.photo ? String(nomineeRow.photo) : null
    });
    nomineesByRoleId.set(normalizedRoleId, bucket);
  }

  return mappedRoleRows.map((mappedRoleRow) => ({
    roleId: Number(mappedRoleRow.roleId),
    roleName: String(mappedRoleRow.roleName || ''),
    hindiName: mappedRoleRow.hindiName ? String(mappedRoleRow.hindiName) : null,
    englishName: mappedRoleRow.englishName ? String(mappedRoleRow.englishName) : null,
    sortOrder: Number(mappedRoleRow.sortOrder || 0),
    nominationCount: Number(mappedRoleRow.nominationCount || 0),
    isNominatedByCurrentUser: Number(mappedRoleRow.isNominatedByCurrentUser || 0) === 1,
    nominees: nomineesByRoleId.get(Number(mappedRoleRow.roleId)) || []
  }));
};

export const committeeDetailsTypes = `
  type CommitteeMember {
    id: Int!
    name: String!
    email: String!
    photo: String
    committeeRole: String
  }

  type CommitteeEvent {
    id: Int!
    eventId: Int!
    committeeId: Int!
    eventName: String!
    eventDisplayName: String!
    eventLogo: String
    status: String!
    category: String
    type: String!
    visibility: String!
    startDate: String
    endDate: String
    createdBy: Int!
    updatedBy: Int
    createdAt: String
    mappedVotingRoles: [EventMappedVotingRole!]!
  }

  type CommitteeDetailsData {
    id: Int!
    committeeId: Int!
    committeeName: String!
    address: String!
    establishYear: Int!
    logo: String
    latitude: Float
    longitude: Float
    contactNumbers: [String!]!
    createdBy: Int!
    createdAt: String!
    committeeRole: String
    userRequestStatus: String
    userRequestRole: String
    members: [CommitteeMember!]!
    events: [CommitteeEvent!]!
    availableRoles: [EventAvailableRole!]!
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
          latitude,
          longitude,
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

      const userRequestStatusResult = await query<any[]>(`
        SELECT status, request_role FROM committee_role_requests
        WHERE committee_id = ? AND requester_user_id = ?
        ORDER BY requested_at DESC
        LIMIT 1
      `, [committeeId, loggedInUserId]);

      const userRequestStatus = userRequestStatusResult.length > 0
        ? userRequestStatusResult[0].status
        : null;

      const userRequestRole = userRequestStatusResult.length > 0
        ? userRequestStatusResult[0].request_role
        : null;

      const isLoggedUserAdmin =
        adminCheckResult.length > 0 &&
        (String(adminCheckResult[0].committee_role || '') === 'COMMITTEE_ADMIN' ||
          String(adminCheckResult[0].committee_role || '') === 'COMMITTEE_MASTER_ADMIN');

      const supportsEventDisplayName = await hasEventsDisplayNameColumn();

      const eventRows = await query<any[]>(`
        SELECT
          e.id,
          e.id AS eventId,
          e.committee_id AS committeeId,
          e.name AS eventName,
          ${supportsEventDisplayName ? "COALESCE(NULLIF(TRIM(e.display_name), ''), LEFT(e.name, 20))" : 'LEFT(e.name, 20)'} AS eventDisplayName,
          e.address,
          e.status,
          e.category,
          e.\`type\` AS type,
          e.visibility,
          DATE_FORMAT(e.start_date, '%Y-%m-%d') AS startDate,
          DATE_FORMAT(e.end_date, '%Y-%m-%d') AS endDate,
          e.created_by AS createdBy,
          e.updated_by AS updatedBy,
          e.created_at AS createdAt,
          e.event_logo AS eventLogo
        FROM events e
        WHERE e.committee_id = ?
        ORDER BY e.start_date ASC, e.name ASC
      `, [committeeId]);

      const hasCommitteeAccess = Boolean(
        adminCheckResult.length > 0 &&
        (
          String(adminCheckResult[0].committee_role || '') === 'COMMITTEE_MEMBER' ||
          String(adminCheckResult[0].committee_role || '') === 'COMMITTEE_ADMIN' ||
          String(adminCheckResult[0].committee_role || '') === 'COMMITTEE_MASTER_ADMIN'
        )
      );

      const visibleEvents = hasCommitteeAccess
        ? eventRows
        : eventRows.filter((event) => String(event.visibility || '').toUpperCase() === 'VISIBLE');

      // Fetch all members of the committee
      const members = await query<any[]>(`
        SELECT 
          u.id,
          u.name,
          u.email,
          u.profile_photo,
          cm.committee_role
        FROM users u
        INNER JOIN users_committees cm ON u.id = cm.user_id
        WHERE cm.committee_id = ? AND cm.committee_role IN ('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
        ORDER BY u.name ASC
      `, [committeeId]);

      // Fetch available master voting roles
      const availableRoles = await getCommitteeAvailableRoles();

      const eventsWithVotingRoles = await Promise.all(
        visibleEvents.map(async (event: any) => ({
          id: event.id,
          eventId: event.eventId,
          committeeId: event.committeeId,
          eventName: event.eventName,
          eventDisplayName: normalizeEventDisplayName(event.eventName, event.eventDisplayName, supportsEventDisplayName),
          eventLogo: event.eventLogo || null,
          status: event.status,
          category: event.category || null,
          type: event.type,
          visibility: event.visibility,
          startDate: event.startDate || null,
          endDate: event.endDate || null,
          createdBy: event.createdBy,
          updatedBy: event.updatedBy || null,
          createdAt: event.createdAt || null,
          mappedVotingRoles: await getEventMappedVotingRoles(event.id, loggedInUserId)
        }))
      );

      return {
        id: committee.id,
        committeeId: committee.id,
        committeeName: committee.committee_name,
        address: committee.address,
        establishYear: committee.establish_year,
        logo: committee.logo || null,
        latitude: committee.latitude != null ? Number(committee.latitude) : null,
        longitude: committee.longitude != null ? Number(committee.longitude) : null,
        contactNumbers: normalizeContactNumbers(committee.contact_numbers),
        createdBy: committee.created_by,
        createdAt: committee.created_at,
        committeeRole: adminCheckResult.length > 0 ? adminCheckResult[0].committee_role || null : null,
        userRequestStatus: userRequestStatus,
        userRequestRole: userRequestRole,
        members: members.map((m: any) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          photo: m.profile_photo || null,
          committeeRole: m.committee_role || null
        })),
        events: eventsWithVotingRoles,
        availableRoles: availableRoles.map((role: any) => ({
          roleId: role.roleId,
          roleName: role.roleName,
          roleCode: role.roleCode || null,
          hindiName: role.hindiName || null,
          englishName: role.englishName || null
        }))
      };
    }
  }
};
