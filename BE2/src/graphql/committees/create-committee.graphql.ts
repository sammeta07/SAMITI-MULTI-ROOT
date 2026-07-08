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

export const createCommitteeTypes = `
  type CreatedCommittee {
    id: Int!
    committeeName: String!
    establishYear: Int!
    address: String!
    contactNumbers: [String!]!
    latitude: Float!
    longitude: Float!
    createdBy: Int!
    createdAt: String!
  }

  type CreateCommitteePayload {
    data: CreatedCommittee!
  }

  input CreateCommitteeInput {
    committeeName: String!
    establishYear: Int
    establish_year: Int
    address: String!
    districtId: Int
    stateId: Int
    latitude: Float!
    longitude: Float!
    contactNumbers: [String!]!
  }
`;

export const createCommitteeMutationFields = `
  createCommittee(input: CreateCommitteeInput!): CreateCommitteePayload!
`;

export const createCommitteeResolvers = {
  Mutation: {
    async createCommittee(
      _: unknown,
      args: {
        input: {
          committeeName: string;
          establishYear: number;
          establish_year?: number;
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
        committeeName,
        establishYear,
        establish_year,
        address,
        districtId = 897,
        stateId = 7,
        latitude,
        longitude,
        contactNumbers
      } = args.input;

      const normalizedEstablishYear = Number(establishYear ?? establish_year);

      if (!committeeName?.trim() || !address?.trim()) {
        throw new Error('Committee name and address are required');
      }

      if (!Number.isFinite(normalizedEstablishYear) || normalizedEstablishYear <= 0) {
        throw new Error('Valid establishYear is required');
      }

      if (!Array.isArray(contactNumbers) || contactNumbers.length === 0) {
        throw new Error('At least one contact number is required');
      }

      const cleanContacts = contactNumbers.map((number) => String(number).trim()).filter(Boolean);
      if (cleanContacts.length === 0) {
        throw new Error('At least one valid contact number is required');
      }

      const nameCollision = await query<RowDataPacket[]>(
        'SELECT id FROM committees WHERE committee_name = ? LIMIT 1',
        [committeeName.trim()]
      );

      if (nameCollision.length > 0) {
        throw new Error('A committee with this name already exists');
      }

      const creationResult = await execute(
        `INSERT INTO committees (
          committee_name,
          establish_year,
          created_by,
          address,
          district_id,
          state_id,
          latitude,
          longitude,
          contact_numbers,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          committeeName.trim(),
          normalizedEstablishYear,
          loggedInUserId,
          address.trim(),
          districtId,
          stateId,
          latitude,
          longitude,
          JSON.stringify(cleanContacts)
        ]
      );

      const newCommitteeId = creationResult.insertId;

      // Creator becomes immediate admin+member — no request workflow needed
      await execute(
        `INSERT INTO users_committees (committee_id, user_id, committee_role, is_favourite)
         VALUES (?, ?, 'COMMITTEE_ADMIN', 0)
         ON DUPLICATE KEY UPDATE committee_role = 'COMMITTEE_ADMIN'`,
        [newCommitteeId, loggedInUserId]
      );

      // Record accepted requests for audit trail
      await execute(
        `INSERT IGNORE INTO committee_role_requests
           (committee_id, requester_user_id, request_role, status, requested_at, action_by_user_id, action_at)
         VALUES
           (?, ?, 'COMMITTEE_MEMBER', 'ACCEPTED', NOW(), ?, NOW()),
           (?, ?, 'COMMITTEE_ADMIN',  'ACCEPTED', NOW(), ?, NOW())`,
        [newCommitteeId, loggedInUserId, loggedInUserId, newCommitteeId, loggedInUserId, loggedInUserId]
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
        [newCommitteeId]
      );

      const created = rows[0];
      if (!created) {
        throw new Error('Committee created but not found for response');
      }

      const contactNumbersArray = Array.isArray(created.contact_numbers)
        ? created.contact_numbers
        : typeof created.contact_numbers === 'string'
          ? JSON.parse(created.contact_numbers)
          : [];

      return {
        data: {
          id: Number(created.id),
          committeeName: created.committee_name,
          establishYear: Number(created.establish_year),
          address: created.address,
          contactNumbers: contactNumbersArray,
          latitude: Number(created.latitude),
          longitude: Number(created.longitude),
          createdBy: Number(created.created_by),
          createdAt: created.created_at
        }
      };
    }
  }
};
