import { query } from '../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { hasEventsDisplayNameColumn } from './event-display-name-support';
import { hasEventsVotingRolesLockedColumn } from './event-voting-roles-lock-support';
import { hasEventsVotingPhaseStateColumn } from './event-voting-phase-support';

async function hasEventsVotingEnabledColumn(): Promise<boolean> {
  const rows = await query<any[]>(
    `SELECT 1 AS column_exists
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'events'
       AND COLUMN_NAME = 'voting_enabled'
     LIMIT 1`
  );

  return rows.length > 0;
}

async function hasEventsVotingClosedColumn(): Promise<boolean> {
  const rows = await query<any[]>(
    `SELECT 1 AS column_exists
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'events'
       AND COLUMN_NAME = 'voting_closed'
     LIMIT 1`
  );

  return rows.length > 0;
}

function throwEventError(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function getEventVotingPhaseState(event: any, supportsVotingPhaseState: boolean): number {
  if (supportsVotingPhaseState) {
    return Number(event?.votingPhaseState || 0);
  }

  if (Number(event?.votingClosed || 0) === 1) {
    return 4;
  }

  if (Number(event?.votingEnabled || 0) === 1) {
    return 3;
  }

  return 0;
}

function getAccessToken(context: any): string {
  const authHeader = context.headers?.authorization;
  const tokenFromCookie = context.cookies?.token;

  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  if (typeof tokenFromCookie === 'string' && tokenFromCookie.trim().length > 0) {
    return tokenFromCookie.trim();
  }

  return '';
}

async function getLoggedInUserId(context: any): Promise<number> {
  const accessToken = getAccessToken(context);
  if (!accessToken) {
    throwEventError('UNAUTHORIZED', 'Missing access token');
  }

  try {
    const decoded: any = await context.jwt.verify(accessToken);
    const loggedInUserId = Number(decoded?.id || decoded?.user_id || decoded?.uid);

    if (!Number.isInteger(loggedInUserId) || loggedInUserId <= 0) {
      throwEventError('UNAUTHORIZED', 'Invalid token payload');
    }

    return loggedInUserId;
  } catch {
    throwEventError('UNAUTHORIZED', 'Invalid or expired token');
  }
}

async function getEventMasterRoles(): Promise<Array<{ roleId: number | null; roleName: string; roleCode: string | null; hindiName: string | null; englishName: string | null; isActive: boolean }>> {
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
        : availableColumns.has('designation')
          ? 'designation'
          : availableColumns.has('title')
            ? 'title'
            : 'NULL';

    const roleCodeExpr = availableColumns.has('role_code')
      ? 'role_code'
      : availableColumns.has('code')
        ? 'code'
        : availableColumns.has('slug')
          ? 'slug'
          : 'NULL';

    const hindiNameExpr = availableColumns.has('hindi_name')
      ? 'hindi_name'
      : 'NULL';

    const englishNameExpr = availableColumns.has('english_name')
      ? 'english_name'
      : 'NULL';

    const isActiveExpr = availableColumns.has('is_active')
      ? 'is_active'
      : availableColumns.has('active')
        ? 'active'
        : '1';

    const orderByExpr = availableColumns.has('sort_order')
      ? 'sort_order ASC, roleName ASC'
      : 'roleName ASC';

    const roleRows = await query<Array<RowDataPacket & {
      roleId: number | null;
      roleName: string | null;
      roleCode: string | null;
      hindiName: string | null;
      englishName: string | null;
      isActive: number | string | null;
    }>>(
      `SELECT
         ${roleIdExpr} AS roleId,
         ${roleNameExpr} AS roleName,
         ${roleCodeExpr} AS roleCode,
         ${hindiNameExpr} AS hindiName,
         ${englishNameExpr} AS englishName,
         ${isActiveExpr} AS isActive
       FROM ${tableName}
       ORDER BY ${orderByExpr}`
    );

    return roleRows
      .map((row) => {
        const normalizedRoleName = String(row.roleName || '').trim();
        const activeToken = String(row.isActive ?? '1').trim().toUpperCase();
        const isActive = ['1', 'TRUE', 'ACTIVE', 'YES', 'Y'].includes(activeToken);

        return {
          roleId: row.roleId !== null && row.roleId !== undefined ? Number(row.roleId) : null,
          roleName: normalizedRoleName,
          roleCode: row.roleCode ? String(row.roleCode).trim() : null,
          hindiName: row.hindiName ? String(row.hindiName).trim() : null,
          englishName: row.englishName ? String(row.englishName).trim() : null,
          isActive
        };
      })
      .filter((row) => row.roleName.length > 0 && row.isActive);
  }

  return [];
}

async function getMappedVotingRolesWithNominees(eventId: number, loggedInUserId: number): Promise<Array<{
  roleId: number;
  roleName: string;
  hindiName: string | null;
  englishName: string | null;
  sortOrder: number;
  nominationCount: number;
  isNominatedByCurrentUser: boolean;
  nominees: Array<{
    userId: number;
    name: string;
    email: string;
    photo: string | null;
  }>;
}>> {
  const mappedVotingRoleRows = await query<Array<RowDataPacket & {
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

  return mappedVotingRoleRows.map((mappedRoleRow) => ({
    roleId: Number(mappedRoleRow.roleId),
    roleName: String(mappedRoleRow.roleName || ''),
    hindiName: mappedRoleRow.hindiName ? String(mappedRoleRow.hindiName) : null,
    englishName: mappedRoleRow.englishName ? String(mappedRoleRow.englishName) : null,
    sortOrder: Number(mappedRoleRow.sortOrder || 0),
    nominationCount: Number(mappedRoleRow.nominationCount || 0),
    isNominatedByCurrentUser: Number(mappedRoleRow.isNominatedByCurrentUser || 0) === 1,
    nominees: nomineesByRoleId.get(Number(mappedRoleRow.roleId)) || []
  }));
}

export const eventDetailsTypes = `
  type EventRoleNominee {
    userId: Int!
    name: String!
    email: String!
    photo: String
  }

  type EventAvailableRole {
    roleId: Int
    roleName: String!
    roleCode: String
    hindiName: String
    englishName: String
  }

  type EventMappedVotingRole {
    roleId: Int!
    roleName: String!
    hindiName: String
    englishName: String
    sortOrder: Int!
    nominationCount: Int!
    isNominatedByCurrentUser: Boolean!
    nominees: [EventRoleNominee!]!
  }

  type UpdateEventVotingRolesPayload {
    eventId: Int!
    mappedVotingRoles: [EventMappedVotingRole!]!
  }

  type LockEventVotingRolesPayload {
    eventId: Int!
    votingRolesLocked: Boolean!
  }

  type UnlockEventVotingRolesPayload {
    eventId: Int!
    votingRolesLocked: Boolean!
  }

  type StartEventNominationsPayload {
    eventId: Int!
    votingPhaseState: Int!
  }

  type StopEventNominationsPayload {
    eventId: Int!
    votingPhaseState: Int!
  }

  type AllowEventVotingPayload {
    eventId: Int!
    votingEnabled: Boolean!
  }

  type StopEventVotingPayload {
    eventId: Int!
    votingClosed: Boolean!
  }

  type NominateEventVotingRolePayload {
    eventId: Int!
    roleId: Int!
    myNominatedRoleId: Int!
    totalNominations: Int!
    mappedVotingRoles: [EventMappedVotingRole!]!
  }

  type WithdrawEventVotingRolePayload {
    eventId: Int!
    roleId: Int!
    myNominatedRoleId: Int
    totalNominations: Int!
    mappedVotingRoles: [EventMappedVotingRole!]!
  }

  type EventParticipant {
    userId: Int!
    name: String!
    email: String!
    photo: String
    designation: String!
    membershipStatus: String!
  }

  type EventDesignationSummary {
    designation: String!
    memberCount: Int!
  }

  type EventProgramSummary {
    id: Int!
    programId: Int!
    programName: String!
    status: String!
    visibility: String!
    startDate: String
    endDate: String
    programBanner: String
  }

  type EventDetails {
    id: Int!
    eventId: Int!
    committeeId: Int
    committeeAddress: String
    eventName: String!
    eventDisplayName: String!
    eventBanner: String
    bannerImages: [String!]!
    status: String!
    category: String
    visibility: String!
    type: String
    startDate: String
    endDate: String
    address: String
    latitude: Float
    longitude: Float
    createdBy: Int!
    updatedBy: Int
    createdAt: String
    programs: [EventProgramSummary!]!
    eventParticipants: [EventParticipant!]!
    designationSummary: [EventDesignationSummary!]!
    eligibleVoterCount: Int!
    availableRoles: [EventAvailableRole!]!
    mappedVotingRoles: [EventMappedVotingRole!]!
    canManageVotingRoles: Boolean!
    canSelfNominate: Boolean!
    currentCommitteeRole: String!
    committeeMemberCount: Int!
    committeeAdminCount: Int!
    votingRolesLocked: Boolean!
    votingEnabled: Boolean!
    votingClosed: Boolean!
    votingPhaseState: Int!
    totalNominations: Int!
    myNominatedRoleId: Int
  }
`;

export const eventDetailsQueryFields = `
    eventDetails(id: Int!): EventDetails!
`;

export const eventDetailsMutationFields = `
  updateEventVotingRoles(eventId: Int!, roleIds: [Int!]!): UpdateEventVotingRolesPayload!
  lockEventVotingRoles(eventId: Int!): LockEventVotingRolesPayload!
  unlockEventVotingRoles(eventId: Int!): UnlockEventVotingRolesPayload!
  startEventNominations(eventId: Int!): StartEventNominationsPayload!
  stopEventNominations(eventId: Int!): StopEventNominationsPayload!
  allowEventVoting(eventId: Int!): AllowEventVotingPayload!
  stopEventVoting(eventId: Int!): StopEventVotingPayload!
  nominateEventVotingRole(eventId: Int!, roleId: Int!): NominateEventVotingRolePayload!
  withdrawEventVotingRole(eventId: Int!, roleId: Int!): WithdrawEventVotingRolePayload!
`;

export const eventDetailsResolvers = {
  Query: {
    async eventDetails(_: any, args: { id: number }, context: any) {
      const eventId = Number(args?.id);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'id must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const supportsEventDisplayName = await hasEventsDisplayNameColumn();
      const supportsVotingRolesLocked = await hasEventsVotingRolesLockedColumn();
      const supportsVotingEnabled = await hasEventsVotingEnabledColumn();
      const supportsVotingClosed = await hasEventsVotingClosedColumn();
      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();

      const eventResult = await query<any[]>(`
        SELECT
          e.id,
          e.id AS eventId,
          e.committee_id AS committeeId,
          c.address AS committeeAddress,
          e.name AS eventName,
          ${supportsEventDisplayName ? "COALESCE(NULLIF(TRIM(e.display_name), ''), LEFT(e.name, 20))" : 'LEFT(e.name, 20)'} AS eventDisplayName,
          e.address,
          e.status,
          e.category,
          e.visibility,
          e.type,
          DATE_FORMAT(e.start_date, '%Y-%m-%d') AS startDate,
          DATE_FORMAT(e.end_date, '%Y-%m-%d') AS endDate,
          e.latitude,
          e.longitude,
          e.created_by AS createdBy,
          e.updated_by AS updatedBy,
          e.created_at AS createdAt,
          ${supportsVotingRolesLocked ? 'COALESCE(e.voting_roles_locked, 0)' : '0'} AS votingRolesLocked
          ${supportsVotingEnabled ? ', COALESCE(e.voting_enabled, 0) AS votingEnabled' : ', 0 AS votingEnabled'}
          ${supportsVotingClosed ? ', COALESCE(e.voting_closed, 0) AS votingClosed' : ', 0 AS votingClosed'}
          ${supportsVotingPhaseState ? ', COALESCE(e.voting_phase_state, 0) AS votingPhaseState' : ', 0 AS votingPhaseState'}
        FROM events e
        LEFT JOIN committees c ON c.id = e.committee_id
        WHERE e.id = ?
        LIMIT 1
      `, [eventId]);

      if (!eventResult || eventResult.length === 0) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventResult[0];
      const visibility = String(event.visibility || '').toUpperCase();

      const committeeMembership = await query<any[]>(
        `SELECT committee_role
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const membership = committeeMembership[0];
      const hasCommitteeAccess = Boolean(
        membership &&
        (String(membership.committee_role || '') === 'COMMITTEE_MEMBER' || String(membership.committee_role || '') === 'COMMITTEE_ADMIN')
      );

      if (visibility === 'HIDDEN' && !hasCommitteeAccess) {
        throwEventError('FORBIDDEN', 'You are not allowed to access this event');
      }

      const canManageVotingRoles = Boolean(membership && String(membership.committee_role || '') === 'COMMITTEE_ADMIN');
      const canSelfNominate = Boolean(membership && String(membership.committee_role || '') === 'COMMITTEE_MEMBER');
      const currentCommitteeRole = canManageVotingRoles
        ? 'COMMITTEE_ADMIN'
        : canSelfNominate
          ? 'COMMITTEE_MEMBER'
          : 'NONE';

      const committeeCountRows = await query<Array<RowDataPacket & { memberCount: number; adminCount: number }>>(
        `SELECT
           SUM(CASE WHEN committee_role = 'COMMITTEE_MEMBER' THEN 1 ELSE 0 END) AS memberCount,
           SUM(CASE WHEN committee_role = 'COMMITTEE_ADMIN' THEN 1 ELSE 0 END) AS adminCount
         FROM users_committees
         WHERE committee_id = ?`,
        [Number(event.committeeId)]
      );
      const committeeMemberCount = Number(committeeCountRows[0]?.memberCount || 0);
      const committeeAdminCount = Number(committeeCountRows[0]?.adminCount || 0);

      const bannerImageRows = await query<Array<RowDataPacket & { mediaUrl: string }>>(
        `SELECT media_url AS mediaUrl
         FROM event_media_assets
         WHERE event_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [eventId]
      );

      const programRows = await query<Array<RowDataPacket & {
        id: number;
        programId: number;
        programName: string;
        status: string;
        visibility: string;
        startDate: string | null;
        endDate: string | null;
        programBanner: string | null;
      }>>(
        `SELECT
           p.id,
           p.id AS programId,
           p.name AS programName,
           p.status,
           p.visibility,
           DATE_FORMAT(p.start_date_time, '%Y-%m-%d %H:%i:%s') AS startDate,
           DATE_FORMAT(p.end_date_time, '%Y-%m-%d %H:%i:%s') AS endDate,
           (
             SELECT pma.media_url
             FROM program_media_assets pma
             WHERE pma.program_id = p.id
             ORDER BY pma.sort_order ASC, pma.id ASC
             LIMIT 1
           ) AS programBanner
         FROM programs p
         WHERE p.event_id = ?
         ORDER BY p.name ASC`,
        [eventId]
      );

      const eventParticipantRows = await query<Array<RowDataPacket & {
        userId: number;
        name: string;
        email: string;
        photo: string | null;
        designation: string;
        membershipStatus: string;
      }>>(
        `SELECT
           ue.user_id AS userId,
           u.name,
           u.email,
           u.profile_photo AS photo,
           UPPER(COALESCE(NULLIF(TRIM(ue.designation), ''), 'MEMBER')) AS designation,
           UPPER(COALESCE(NULLIF(TRIM(ue.status), ''), 'ACTIVE')) AS membershipStatus
         FROM users_events ue
         INNER JOIN users u ON u.id = ue.user_id
         WHERE ue.event_id = ?
         ORDER BY designation ASC, u.name ASC`,
        [eventId]
      );

      const designationSummaryRows = await query<Array<RowDataPacket & {
        designation: string;
        memberCount: number;
      }>>(
        `SELECT
           UPPER(COALESCE(NULLIF(TRIM(designation), ''), 'MEMBER')) AS designation,
           COUNT(*) AS memberCount
         FROM users_events
         WHERE event_id = ?
         GROUP BY UPPER(COALESCE(NULLIF(TRIM(designation), ''), 'MEMBER'))
         ORDER BY memberCount DESC, designation ASC`,
        [eventId]
      );

      const availableRoles = await getEventMasterRoles();

      const mappedVotingRoleRows = await getMappedVotingRolesWithNominees(eventId, loggedInUserId);

      const nominationMetaRows = await query<Array<RowDataPacket & {
        totalNominations: number;
        myNominatedRoleId: number | null;
      }>>(
        `SELECT
           COUNT(*) AS totalNominations,
           MAX(CASE WHEN user_id = ? THEN role_id ELSE NULL END) AS myNominatedRoleId
         FROM event_voting_role_nominations
         WHERE event_id = ?`,
        [loggedInUserId, eventId]
      );

      const nominationMeta = nominationMetaRows[0] || { totalNominations: 0, myNominatedRoleId: null };

      return {
        ...event,
        eventBanner: bannerImageRows[0]?.mediaUrl || null,
        bannerImages: bannerImageRows.map((row) => row.mediaUrl),
        programs: programRows.map((programRow) => ({
          id: Number(programRow.id),
          programId: Number(programRow.programId),
          programName: String(programRow.programName || ''),
          status: String(programRow.status || ''),
          visibility: String(programRow.visibility || ''),
          startDate: programRow.startDate,
          endDate: programRow.endDate,
          programBanner: programRow.programBanner || null
        })),
        eventParticipants: eventParticipantRows.map((participantRow) => ({
          userId: Number(participantRow.userId),
          name: String(participantRow.name || ''),
          email: String(participantRow.email || ''),
          photo: participantRow.photo || null,
          designation: String(participantRow.designation || 'MEMBER'),
          membershipStatus: String(participantRow.membershipStatus || 'ACTIVE')
        })),
        designationSummary: designationSummaryRows.map((summaryRow) => ({
          designation: String(summaryRow.designation || 'MEMBER'),
          memberCount: Number(summaryRow.memberCount || 0)
        })),
        eligibleVoterCount: eventParticipantRows.length,
        availableRoles: availableRoles.map((roleRow) => ({
          roleId: roleRow.roleId,
          roleName: roleRow.roleName,
          roleCode: roleRow.roleCode,
          hindiName: roleRow.hindiName,
          englishName: roleRow.englishName
        })),
        mappedVotingRoles: mappedVotingRoleRows,
        canManageVotingRoles,
        canSelfNominate,
        currentCommitteeRole,
        committeeMemberCount,
        committeeAdminCount,
        votingRolesLocked: Number(event.votingRolesLocked || 0) === 1,
        votingEnabled: Number(event.votingEnabled || 0) === 1,
        votingClosed: Number(event.votingClosed || 0) === 1,
        votingPhaseState: getEventVotingPhaseState(event, supportsVotingPhaseState),
        totalNominations: Number(nominationMeta.totalNominations || 0),
        myNominatedRoleId: nominationMeta.myNominatedRoleId !== null ? Number(nominationMeta.myNominatedRoleId) : null
      };
    }
  },
  Mutation: {
    async updateEventVotingRoles(_: any, args: { eventId: number; roleIds: number[] }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const roleIds = Array.isArray(args?.roleIds)
        ? Array.from(new Set(args.roleIds.map((roleId) => Number(roleId)).filter((roleId) => Number.isInteger(roleId) && roleId > 0)))
        : [];

      const loggedInUserId = await getLoggedInUserId(context);
      const supportsVotingRolesLocked = await hasEventsVotingRolesLockedColumn();
      const supportsVotingEnabled = await hasEventsVotingEnabledColumn();
      const supportsVotingClosed = await hasEventsVotingClosedColumn();

      const eventRows = await query<any[]>(
        `SELECT
           id,
           committee_id AS committeeId,
           ${supportsVotingRolesLocked ? 'COALESCE(voting_roles_locked, 0)' : '0'} AS votingRolesLocked,
             ${supportsVotingEnabled ? 'COALESCE(voting_enabled, 0)' : '0'} AS votingEnabled,
             ${supportsVotingClosed ? 'COALESCE(voting_closed, 0)' : '0'} AS votingClosed
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<any[]>(
        `SELECT committee_role
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && String(membershipRows[0].committee_role || '') === 'COMMITTEE_ADMIN');
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can configure event voting roles');
      }

      if (Number(event.votingRolesLocked || 0) === 1) {
        throwEventError('FORBIDDEN', 'Voting role selection is locked for this event and cannot be changed');
      }

      if (Number(event.votingEnabled || 0) === 1) {
        throwEventError('FORBIDDEN', 'Voting is already enabled for this event; role selection cannot be changed');
      }

      if (Number(event.votingClosed || 0) === 1) {
        throwEventError('FORBIDDEN', 'Voting has been closed for this event; role selection cannot be changed');
      }

      if (roleIds.length > 0) {
        const placeholders = roleIds.map(() => '?').join(',');
        const validRoles = await query<Array<RowDataPacket & { roleId: number }>>(
          `SELECT role_id AS roleId
           FROM events_roles_master
           WHERE is_active = 1
             AND role_id IN (${placeholders})`,
          roleIds
        );

        if (validRoles.length !== roleIds.length) {
          throwEventError('BAD_REQUEST', 'One or more selected roles are invalid or inactive');
        }
      }

      await query(`DELETE FROM event_voting_roles WHERE event_id = ?`, [eventId]);

      for (const roleId of roleIds) {
        await query(
          `INSERT INTO event_voting_roles (event_id, role_id, created_by)
           VALUES (?, ?, ?)`,
          [eventId, roleId, loggedInUserId]
        );
      }

      const mappedVotingRoleRows = await getMappedVotingRolesWithNominees(eventId, loggedInUserId);

      return {
        eventId,
        mappedVotingRoles: mappedVotingRoleRows
      };
    },

    async lockEventVotingRoles(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingRolesLocked = await hasEventsVotingRolesLockedColumn();
      const supportsVotingEnabled = await hasEventsVotingEnabledColumn();
      const supportsVotingClosed = await hasEventsVotingClosedColumn();
      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingRolesLocked) {
        throwEventError('INTERNAL', 'Voting roles lock column is missing. Please run latest migrations.');
      }
      if (!supportsVotingEnabled) {
        throwEventError('INTERNAL', 'Voting enabled column is missing. Please run latest migrations.');
      }
      if (!supportsVotingClosed) {
        throwEventError('INTERNAL', 'Voting closed column is missing. Please run latest migrations.');
      }
      if (!supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase state column is missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingRolesLocked: number;
        votingEnabled: number;
        votingClosed: number;
        votingPhaseState: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_roles_locked, 0) AS votingRolesLocked,
           COALESCE(voting_enabled, 0) AS votingEnabled,
           COALESCE(voting_closed, 0) AS votingClosed,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role = 'COMMITTEE_ADMIN' THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can lock voting role selection');
      }

      if (Number(event.votingRolesLocked || 0) !== 1) {
        await query(
          `UPDATE events
           SET voting_roles_locked = 1,
               voting_phase_state = 0,
               voting_enabled = 0,
               voting_closed = 0,
               updated_by = ?
           WHERE id = ?`,
          [loggedInUserId, eventId]
        );
      }

      return {
        eventId,
        votingRolesLocked: true
      };
    },

    async startEventNominations(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingRolesLocked = await hasEventsVotingRolesLockedColumn();
      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingRolesLocked || !supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase columns are missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingRolesLocked: number;
        votingPhaseState: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_roles_locked, 0) AS votingRolesLocked,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role = 'COMMITTEE_ADMIN' THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can start nominations');
      }

      if (Number(event.votingRolesLocked || 0) !== 1) {
        throwEventError('BAD_REQUEST', 'Lock voting roles before starting nominations');
      }

      if (Number(event.votingPhaseState || 0) !== 0) {
        throwEventError('BAD_REQUEST', 'Nominations have already been started for this event');
      }

      await query(
        `UPDATE events
         SET voting_phase_state = 1,
             updated_by = ?
         WHERE id = ?`,
        [loggedInUserId, eventId]
      );

      return {
        eventId,
        votingPhaseState: 1
      };
    },

    async stopEventNominations(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase state column is missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingPhaseState: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role = 'COMMITTEE_ADMIN' THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can stop nominations');
      }

      if (Number(event.votingPhaseState || 0) !== 1) {
        throwEventError('BAD_REQUEST', 'Nominations are not active for this event');
      }

      await query(
        `UPDATE events
         SET voting_phase_state = 2,
             updated_by = ?
         WHERE id = ?`,
        [loggedInUserId, eventId]
      );

      return {
        eventId,
        votingPhaseState: 2
      };
    },

    async unlockEventVotingRoles(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingRolesLocked = await hasEventsVotingRolesLockedColumn();
      if (!supportsVotingRolesLocked) {
        throwEventError('INTERNAL', 'Voting roles lock column is missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingRolesLocked: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_roles_locked, 0) AS votingRolesLocked
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role = 'COMMITTEE_ADMIN' THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can allow voting');
      }

      if (Number(event.votingRolesLocked || 0) !== 0) {
        await query(
          `UPDATE events
           SET voting_roles_locked = 0,
               updated_by = ?
           WHERE id = ?`,
          [loggedInUserId, eventId]
        );
      }

      return {
        eventId,
        votingRolesLocked: false
      };
    },

    async allowEventVoting(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingEnabled = await hasEventsVotingEnabledColumn();
      const supportsVotingClosed = await hasEventsVotingClosedColumn();
      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingEnabled || !supportsVotingClosed || !supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase columns are missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingRolesLocked: number;
        votingEnabled: number;
        votingClosed: number;
        votingPhaseState: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_roles_locked, 0) AS votingRolesLocked,
           COALESCE(voting_enabled, 0) AS votingEnabled,
           COALESCE(voting_closed, 0) AS votingClosed,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role = 'COMMITTEE_ADMIN' THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can allow voting');
      }

      if (Number(event.votingRolesLocked || 0) !== 1) {
        throwEventError('BAD_REQUEST', 'Lock voting roles before allowing voting');
      }

      if (Number(event.votingPhaseState || 0) !== 2) {
        throwEventError('BAD_REQUEST', 'Stop nominations before starting voting');
      }

      if (Number(event.votingEnabled || 0) !== 1) {
        await query(
          `UPDATE events
           SET voting_enabled = 1,
               voting_closed = 0,
               voting_phase_state = 3,
               updated_by = ?
           WHERE id = ?`,
          [loggedInUserId, eventId]
        );
      }

      return {
        eventId,
        votingEnabled: true
      };
    },

    async stopEventVoting(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingEnabled = await hasEventsVotingEnabledColumn();
      const supportsVotingClosed = await hasEventsVotingClosedColumn();
      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingEnabled || !supportsVotingClosed || !supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase columns are missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingEnabled: number;
        votingClosed: number;
        votingPhaseState: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_enabled, 0) AS votingEnabled,
           COALESCE(voting_closed, 0) AS votingClosed,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role = 'COMMITTEE_ADMIN' THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can stop voting');
      }

      if (Number(event.votingEnabled || 0) !== 1) {
        throwEventError('BAD_REQUEST', 'Voting is not active for this event');
      }

      if (Number(event.votingPhaseState || 0) !== 3) {
        throwEventError('BAD_REQUEST', 'Voting must be started before it can be stopped');
      }

      await query(
        `UPDATE events
         SET voting_enabled = 0,
             voting_closed = 1,
             voting_phase_state = 4,
             updated_by = ?
         WHERE id = ?`,
        [loggedInUserId, eventId]
      );

      return {
        eventId,
        votingClosed: true
      };
    },

    async nominateEventVotingRole(_: any, args: { eventId: number; roleId: number }, context: any) {
      const eventId = Number(args?.eventId);
      const roleId = Number(args?.roleId);

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      if (!Number.isInteger(roleId) || roleId <= 0) {
        throwEventError('BAD_REQUEST', 'roleId must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & { id: number; committeeId: number; votingPhaseState: number }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const membershipRows = await query<Array<RowDataPacket & {
        isCommitteeMember: number;
        isCommitteeAdmin: number;
      }>>(
        `SELECT
           CASE WHEN committee_role IN ('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN') THEN 1 ELSE 0 END AS isCommitteeMember,
           CASE WHEN committee_role = 'COMMITTEE_ADMIN' THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(eventRows[0].committeeId), loggedInUserId]
      );

      const membership = membershipRows[0];
      const isOnlyMember = Boolean(membership && Number(membership.isCommitteeMember) === 1 && Number(membership.isCommitteeAdmin) !== 1);
      if (!isOnlyMember) {
        throwEventError('FORBIDDEN', 'Only group members can nominate themselves');
      }

      if (Number(eventRows[0].votingPhaseState || 0) !== 1) {
        throwEventError('FORBIDDEN', 'Nominations are not open for this event');
      }

      const mappedRoleRows = await query<Array<RowDataPacket & { roleId: number }>>(
        `SELECT role_id AS roleId
         FROM event_voting_roles
         WHERE event_id = ? AND role_id = ?
         LIMIT 1`,
        [eventId, roleId]
      );

      if (!mappedRoleRows.length) {
        throwEventError('BAD_REQUEST', 'Selected role is not mapped for this event');
      }

      const existingNominationRows = await query<Array<RowDataPacket & { roleId: number }>>(
        `SELECT role_id AS roleId
         FROM event_voting_role_nominations
         WHERE event_id = ? AND user_id = ?
         LIMIT 1`,
        [eventId, loggedInUserId]
      );

      if (existingNominationRows.length) {
        throwEventError('BAD_REQUEST', 'You can nominate only once for one role in this event');
      }

      await query(
        `INSERT INTO event_voting_role_nominations (event_id, role_id, user_id)
         VALUES (?, ?, ?)`,
        [eventId, roleId, loggedInUserId]
      );

      const mappedVotingRoleRows = await getMappedVotingRolesWithNominees(eventId, loggedInUserId);

      const nominationMetaRows = await query<Array<RowDataPacket & {
        totalNominations: number;
      }>>(
        `SELECT COUNT(*) AS totalNominations
         FROM event_voting_role_nominations
         WHERE event_id = ?`,
        [eventId]
      );

      return {
        eventId,
        roleId,
        myNominatedRoleId: roleId,
        totalNominations: Number(nominationMetaRows[0]?.totalNominations || 0),
        mappedVotingRoles: mappedVotingRoleRows
      };
    },

    async withdrawEventVotingRole(_: any, args: { eventId: number; roleId: number }, context: any) {
      const eventId = Number(args?.eventId);
      const roleId = Number(args?.roleId);

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      if (!Number.isInteger(roleId) || roleId <= 0) {
        throwEventError('BAD_REQUEST', 'roleId must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & { id: number; committeeId: number; votingPhaseState: number }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const membershipRows = await query<Array<RowDataPacket & {
        isCommitteeMember: number;
        isCommitteeAdmin: number;
      }>>(
        `SELECT
           CASE WHEN committee_role IN ('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN') THEN 1 ELSE 0 END AS isCommitteeMember,
           CASE WHEN committee_role = 'COMMITTEE_ADMIN' THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(eventRows[0].committeeId), loggedInUserId]
      );

      const membership = membershipRows[0];
      const isOnlyMember = Boolean(membership && Number(membership.isCommitteeMember) === 1 && Number(membership.isCommitteeAdmin) !== 1);
      if (!isOnlyMember) {
        throwEventError('FORBIDDEN', 'Only group members can withdraw their nomination');
      }

      if (Number(eventRows[0].votingPhaseState || 0) !== 1) {
        throwEventError('FORBIDDEN', 'Nomination withdrawal is closed because nominations are not open for this event');
      }

      const existingNominationRows = await query<Array<RowDataPacket & { roleId: number }>>(
        `SELECT role_id AS roleId
         FROM event_voting_role_nominations
         WHERE event_id = ? AND user_id = ?
         LIMIT 1`,
        [eventId, loggedInUserId]
      );

      if (!existingNominationRows.length) {
        throwEventError('BAD_REQUEST', 'No nomination found to withdraw for this event');
      }

      if (Number(existingNominationRows[0].roleId) !== roleId) {
        throwEventError('BAD_REQUEST', 'You can only withdraw your currently nominated role');
      }

      await query(
        `DELETE FROM event_voting_role_nominations
         WHERE event_id = ? AND user_id = ? AND role_id = ?`,
        [eventId, loggedInUserId, roleId]
      );

      const mappedVotingRoleRows = await query<Array<RowDataPacket & {
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

      const nominationMetaRows = await query<Array<RowDataPacket & {
        totalNominations: number;
      }>>(
        `SELECT COUNT(*) AS totalNominations
         FROM event_voting_role_nominations
         WHERE event_id = ?`,
        [eventId]
      );

      return {
        eventId,
        roleId,
        myNominatedRoleId: null,
        totalNominations: Number(nominationMetaRows[0]?.totalNominations || 0),
        mappedVotingRoles: mappedVotingRoleRows.map((mappedRoleRow) => ({
          roleId: Number(mappedRoleRow.roleId),
          roleName: String(mappedRoleRow.roleName || ''),
          hindiName: mappedRoleRow.hindiName ? String(mappedRoleRow.hindiName) : null,
          englishName: mappedRoleRow.englishName ? String(mappedRoleRow.englishName) : null,
          sortOrder: Number(mappedRoleRow.sortOrder || 0),
          nominationCount: Number(mappedRoleRow.nominationCount || 0),
          isNominatedByCurrentUser: Number(mappedRoleRow.isNominatedByCurrentUser || 0) === 1
        }))
      };
    }
  }
};