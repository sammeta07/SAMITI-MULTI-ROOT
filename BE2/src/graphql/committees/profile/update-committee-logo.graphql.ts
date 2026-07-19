import { RowDataPacket } from 'mysql2/promise';
import { execute, query } from '../../../config/db';

type CommitteeLogoRow = RowDataPacket & {
  id: number;
  logo: string | null;
};

export const updateCommitteeLogoTypes = `
  type UpdatedCommitteeLogo {
    committeeId: Int!
    logo: String
  }

  type UpdateCommitteeLogoPayload {
    data: UpdatedCommitteeLogo!
  }

  input UpdateCommitteeLogoInput {
    committeeId: Int!
    logo: String!
  }
`;

export const updateCommitteeLogoMutationFields = `
  updateCommitteeLogo(input: UpdateCommitteeLogoInput!): UpdateCommitteeLogoPayload!
`;

export const updateCommitteeLogoResolvers = {
  Mutation: {
    async updateCommitteeLogo(
      _: unknown,
      args: {
        input: {
          committeeId: number;
          logo: string;
        };
      },
      context: any
    ) {
      const authHeader = context.headers?.authorization;
      const tokenFromCookie = context.cookies?.token;
      let accessToken: string | null = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.slice(7);
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

      const { committeeId, logo } = args.input;

      if (!committeeId) {
        throw new Error('Committee ID is required');
      }

      if (!logo?.trim()) {
        throw new Error('Committee logo is required');
      }

      const committeeExists = await query<RowDataPacket[]>(
        'SELECT id FROM committees WHERE id = ? LIMIT 1',
        [committeeId]
      );

      if (committeeExists.length === 0) {
        throw new Error('Committee not found');
      }

      const adminCheckRows = await query<RowDataPacket[]>(
        `SELECT committee_id
         FROM users_committees
         WHERE committee_id = ?
           AND user_id = ?
           AND committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
         LIMIT 1`,
        [committeeId, loggedInUserId]
      );

      if (adminCheckRows.length === 0) {
        throw new Error('Only committee admins can update the committee logo');
      }

      await execute(
        `UPDATE committees
         SET logo = ?
         WHERE id = ?`,
        [logo.trim(), committeeId]
      );

      const rows = await query<CommitteeLogoRow[]>(
        `SELECT id, logo
         FROM committees
         WHERE id = ?
         LIMIT 1`,
        [committeeId]
      );

      const updated = rows[0];
      if (!updated) {
        throw new Error('Committee logo updated but not found for response');
      }

      return {
        data: {
          committeeId: Number(updated.id),
          logo: updated.logo || null
        }
      };
    }
  }
};

