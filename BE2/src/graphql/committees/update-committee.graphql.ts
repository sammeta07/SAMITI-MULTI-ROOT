import { RowDataPacket } from 'mysql2/promise';
import { execute, query } from '../../config/db';

type CommitteeRow = RowDataPacket & {
  id: number;
  committee_name: string;
  since: number;
  area: string;
  contact_numbers: string | string[] | null;
  description: string;
  latitude: number;
  longitude: number;
  logo: string | null;
  created_by: number;
  created_at: string;
};

export const updateCommitteeTypes = `
  input UpdateCommitteeInput {
    committeeId: Int!
    committeeName: String!
    since: Int!
    area: String!
    districtId: Int
    stateId: Int
    latitude: Float!
    longitude: Float!
    contactNumbers: [String!]!
    description: String!
    logo: String
  }
`;

export const updateCommitteeMutationFields = `
  updateCommittee(input: UpdateCommitteeInput!): CreateCommitteePayload!
`;

export const updateCommitteeResolvers = {
  Mutation: {
    async updateCommittee(
      _: unknown,
      args: {
        input: {
          committeeId: number;
          committeeName: string;
          since: number;
          area: string;
          districtId?: number | null;
          stateId?: number | null;
          latitude: number;
          longitude: number;
          contactNumbers: string[];
          description: string;
          logo?: string | null;
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

      const {
        committeeId,
        committeeName,
        since,
        area,
        districtId = 897,
        stateId = 7,
        latitude,
        longitude,
        contactNumbers,
        description,
        logo = null
      } = args.input;

      if (!committeeId) {
        throw new Error('Committee ID is required');
      }

      if (!committeeName?.trim() || !area?.trim() || !description?.trim()) {
        throw new Error('Committee name, area and description are required');
      }

      if (!Array.isArray(contactNumbers) || contactNumbers.length === 0) {
        throw new Error('At least one contact number is required');
      }

      const cleanContacts = contactNumbers.map((number) => String(number).trim()).filter(Boolean);
      if (cleanContacts.length === 0) {
        throw new Error('At least one valid contact number is required');
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
         FROM committee_members
         WHERE committee_id = ?
           AND user_id = ?
           AND is_committee_admin = 1
         LIMIT 1`,
        [committeeId, loggedInUserId]
      );

      if (adminCheckRows.length === 0) {
        throw new Error('Only committee admins can edit committee profile');
      }

      await execute(
        `UPDATE committees
         SET committee_name = ?,
             since = ?,
             area = ?,
             district_id = ?,
             state_id = ?,
             latitude = ?,
             longitude = ?,
             contact_numbers = ?,
             description = ?,
             logo = ?
         WHERE id = ?`,
        [
          committeeName.trim(),
          since,
          area.trim(),
          districtId,
          stateId,
          latitude,
          longitude,
          JSON.stringify(cleanContacts),
          description.trim(),
          logo,
          committeeId
        ]
      );

      const rows = await query<CommitteeRow[]>(
        `SELECT
          id,
          committee_name,
          since,
          area,
          contact_numbers,
          description,
          latitude,
          longitude,
          logo,
          created_by,
          created_at
        FROM committees
        WHERE id = ?
        LIMIT 1`,
        [committeeId]
      );

      const updated = rows[0];
      if (!updated) {
        throw new Error('Committee updated but not found for response');
      }

      const contactNumbersArray = Array.isArray(updated.contact_numbers)
        ? updated.contact_numbers
        : typeof updated.contact_numbers === 'string'
          ? JSON.parse(updated.contact_numbers)
          : [];

      return {
        statusCode: 200,
        status: 'success',
        message: 'Committee updated successfully',
        data: {
          id: Number(updated.id),
          committeeName: updated.committee_name,
          since: Number(updated.since),
          area: updated.area,
          contactNumbers: contactNumbersArray,
          description: updated.description,
          latitude: Number(updated.latitude),
          longitude: Number(updated.longitude),
          logo: updated.logo,
          createdBy: Number(updated.created_by),
          createdAt: updated.created_at
        }
      };
    }
  }
};
