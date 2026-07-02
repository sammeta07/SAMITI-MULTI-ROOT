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

export const createCommitteeTypes = `
  type CreatedCommittee {
    id: Int!
    committeeName: String!
    since: Int!
    area: String!
    contactNumbers: [String!]!
    description: String!
    latitude: Float!
    longitude: Float!
    logo: String
    createdBy: Int!
    createdAt: String!
  }

  type CreateCommitteePayload {
    statusCode: Int!
    status: String!
    message: String!
    data: CreatedCommittee!
  }

  input CreateCommitteeInput {
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
          since,
          created_by,
          area,
          district_id,
          state_id,
          latitude,
          longitude,
          contact_numbers,
          description,
          logo,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          committeeName.trim(),
          since,
          loggedInUserId,
          area.trim(),
          districtId,
          stateId,
          latitude,
          longitude,
          JSON.stringify(cleanContacts),
          description.trim(),
          logo
        ]
      );

      const newCommitteeId = creationResult.insertId;

      await execute(
        `INSERT INTO committee_members (
          committee_id,
          user_id,
          is_committee_admin,
          is_committee_member,
          membership_status,
          membership_request_created_at,
          membership_status_action_by,
          membership_status_action_at,
          admin_status,
          admin_request_created_at,
          admin_status_action_by,
          admin_status_action_at,
          is_favourite
        ) VALUES (?, ?, 1, 1, 'ACCEPTED', NOW(), ?, NOW(), 'ACCEPTED', NOW(), ?, NOW(), 0)`,
        [newCommitteeId, loggedInUserId, loggedInUserId, loggedInUserId]
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
        statusCode: 201,
        status: 'success',
        message: 'Committee created successfully',
        data: {
          id: Number(created.id),
          committeeName: created.committee_name,
          since: Number(created.since),
          area: created.area,
          contactNumbers: contactNumbersArray,
          description: created.description,
          latitude: Number(created.latitude),
          longitude: Number(created.longitude),
          logo: created.logo,
          createdBy: Number(created.created_by),
          createdAt: created.created_at
        }
      };
    }
  }
};
