import { RowDataPacket } from 'mysql2/promise';
import { execute, query } from '../../config/db';

type CommitteeRow = RowDataPacket & {
  id: number;
  committee_name: string;
  establish_year: number;
  address: string;
  contact_numbers: string | string[] | null;
  latitude: number;
  longitude: number;
  created_by: number;
  created_at: string;
};

export const updateCommitteeTypes = `
  input UpdateCommitteeInput {
    committeeId: Int!
    committeeName: String!
    establishYear: Int!
    address: String!
    districtId: Int
    stateId: Int
    latitude: Float!
    longitude: Float!
    contactNumbers: [String!]!
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
          establishYear: number;
          address: string;
          districtId?: number | null;
          stateId?: number | null;
          latitude: number;
          longitude: number;
          contactNumbers: string[];
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
        establishYear,
        address,
        districtId = 897,
        stateId = 7,
        latitude,
        longitude,
        contactNumbers
      } = args.input;

      if (!committeeId) {
        throw new Error('Committee ID is required');
      }

      if (!committeeName?.trim() || !address?.trim()) {
        throw new Error('Committee name and address are required');
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
         FROM users_committees
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
             establish_year = ?,
             address = ?,
             district_id = ?,
             state_id = ?,
             latitude = ?,
             longitude = ?,
             contact_numbers = ?
         WHERE id = ?`,
        [
          committeeName.trim(),
          establishYear,
          address.trim(),
          districtId,
          stateId,
          latitude,
          longitude,
          JSON.stringify(cleanContacts),
          committeeId
        ]
      );

      const rows = await query<CommitteeRow[]>(
        `SELECT
          id,
          committee_name,
          establish_year,
          address,
          contact_numbers,
          latitude,
          longitude,
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
        data: {
          id: Number(updated.id),
          committeeName: updated.committee_name,
          establishYear: Number(updated.establish_year),
          address: updated.address,
          contactNumbers: contactNumbersArray,
          latitude: Number(updated.latitude),
          longitude: Number(updated.longitude),
          createdBy: Number(updated.created_by),
          createdAt: updated.created_at
        }
      };
    }
  }
};
