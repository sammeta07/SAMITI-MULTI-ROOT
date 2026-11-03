import { execute, query } from '../../config/db';
import { getLoggedInUserId, throwEventError } from '../events/details/voting/event-voting-core.graphql';
import { hasPermission, PERMISSIONS } from '../../authorization/authorization';

export const programOwnerTypes = `
  type ProgramOwnerCandidate {
    userId: Int!
    name: String!
  }

  type ProgramOwnerPayload {
    programId: Int!
    canAssignOwner: Boolean!
    ownerUserId: Int
    ownerName: String
    ownerDesignation: String
    ownerDesignationColor: String
    ownerDesignationIcon: String
    ownerAssignedBy: Int
    ownerAssignedAt: String
  }
`;

export const programOwnerQueryFields = `
  programOwnerCandidates(programId: Int!): [ProgramOwnerCandidate!]!
`;

export const programOwnerMutationFields = `
  assignProgramOwner(programId: Int!, ownerUserId: Int): ProgramOwnerPayload!
`;

async function getProgramAssignmentContext(programId: number): Promise<any> {
  const rows = await query<any[]>(
    `SELECT
       p.id AS programId,
       p.owner_user_id AS ownerUserId,
       e.id AS eventId,
       e.committee_id AS committeeId
     FROM programs p
     INNER JOIN events e ON e.id = p.event_id
     WHERE p.id = ?
     LIMIT 1`,
    [programId]
  );

  if (rows.length === 0) {
    throwEventError('NOT_FOUND', 'Program not found');
  }
  return rows[0];
}

async function assertCanAssignOwner(assignmentContext: any, userId: number): Promise<void> {
  const canAssign = await hasPermission(
    userId,
    PERMISSIONS.PROGRAM_ASSIGN_OWNER,
    { type: 'EVENT', id: Number(assignmentContext.eventId) }
  );
  if (!canAssign) {
    throwEventError('FORBIDDEN', 'Only Adhyaksha, Upadhyaksha, or a master admin can assign program owners');
  }
}

export const programOwnerResolvers = {
  Query: {
    async programOwnerCandidates(_: any, args: { programId: number }, context: any) {
      const programId = Number(args?.programId);
      if (!Number.isInteger(programId) || programId <= 0) {
        throwEventError('BAD_REQUEST', 'programId must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const assignmentContext = await getProgramAssignmentContext(programId);
      await assertCanAssignOwner(assignmentContext, loggedInUserId);

      const rows = await query<any[]>(
        `SELECT u.id AS userId, u.name
         FROM users_committees uc
         INNER JOIN users u ON u.id = uc.user_id
         WHERE uc.committee_id = ?
           AND uc.committee_role IN ('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
         ORDER BY u.name ASC`,
        [Number(assignmentContext.committeeId)]
      );

      return rows.map((row) => ({
        userId: Number(row.userId),
        name: String(row.name || '')
      }));
    }
  },
  Mutation: {
    async assignProgramOwner(_: any, args: { programId: number; ownerUserId?: number | null }, context: any) {
      const programId = Number(args?.programId);
      if (!Number.isInteger(programId) || programId <= 0) {
        throwEventError('BAD_REQUEST', 'programId must be a positive integer');
      }

      const requestedOwnerId = args.ownerUserId === null || args.ownerUserId === undefined
        ? null
        : Number(args.ownerUserId);
      if (requestedOwnerId !== null && (!Number.isInteger(requestedOwnerId) || requestedOwnerId <= 0)) {
        throwEventError('BAD_REQUEST', 'ownerUserId must be a positive integer or null');
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const assignmentContext = await getProgramAssignmentContext(programId);
      await assertCanAssignOwner(assignmentContext, loggedInUserId);
      const eventId = Number(assignmentContext.eventId);

      if (requestedOwnerId !== null) {
        const memberRows = await query<any[]>(
          `SELECT user_id
           FROM users_committees
           WHERE committee_id = ?
             AND user_id = ?
             AND committee_role IN ('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
           LIMIT 1`,
          [Number(assignmentContext.committeeId), requestedOwnerId]
        );
        if (memberRows.length === 0) {
          throwEventError('BAD_REQUEST', 'The selected owner must be a member of this committee');
        }
      }

      await execute(
        `UPDATE programs
         SET owner_user_id = ?,
             owner_assigned_by = IF(? IS NULL, NULL, ?),
             owner_assigned_at = IF(? IS NULL, NULL, CURRENT_TIMESTAMP)
         WHERE id = ?`,
        [
          requestedOwnerId,
          requestedOwnerId,
          loggedInUserId,
          requestedOwnerId,
          programId
        ]
      );

      const updatedRows = await query<any[]>(
        `SELECT
           p.id AS programId,
           p.owner_user_id AS ownerUserId,
           owner.name AS ownerName,
           UPPER(COALESCE(NULLIF(TRIM(ownerUE.designation), ''), 'MEMBER')) AS ownerDesignation,
           ownerERM.color AS ownerDesignationColor,
           CASE
             WHEN ownerERM.icon IS NOT NULL AND CHAR_LENGTH(ownerERM.icon) > 0
             THEN CASE
                    WHEN CHAR_LENGTH(ownerERM.icon) = 1 THEN ownerERM.icon
                    ELSE CONVERT(CAST(ownerERM.icon AS BINARY) USING utf8mb4)
                  END
             ELSE NULL
           END AS ownerDesignationIcon,
           p.owner_assigned_by AS ownerAssignedBy,
           DATE_FORMAT(p.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt
         FROM programs p
         LEFT JOIN users owner ON owner.id = p.owner_user_id
         LEFT JOIN users_events ownerUE
           ON ownerUE.event_id = ? AND ownerUE.user_id = p.owner_user_id
         LEFT JOIN events_roles_master ownerERM ON ownerERM.role_id = ownerUE.role_id
         WHERE p.id = ?
         LIMIT 1`,
        [eventId, programId]
      );

      const updated = updatedRows[0];
      if (updated && updated.ownerDesignationIcon && Buffer.isBuffer(updated.ownerDesignationIcon)) {
        updated.ownerDesignationIcon = updated.ownerDesignationIcon.toString('utf8');
      }
      return {
        programId: Number(updated.programId),
        canAssignOwner: await hasPermission(
          loggedInUserId,
          PERMISSIONS.PROGRAM_ASSIGN_OWNER,
          { type: 'EVENT', id: eventId }
        ),
        ownerUserId: updated.ownerUserId === null ? null : Number(updated.ownerUserId),
        ownerName: updated.ownerName || null,
        ownerDesignation: updated.ownerDesignation || null,
        ownerDesignationColor: updated.ownerDesignationColor || null,
        ownerDesignationIcon: updated.ownerDesignationIcon || null,
        ownerAssignedBy: updated.ownerAssignedBy === null ? null : Number(updated.ownerAssignedBy),
        ownerAssignedAt: updated.ownerAssignedAt || null
      };
    }
  }
};
