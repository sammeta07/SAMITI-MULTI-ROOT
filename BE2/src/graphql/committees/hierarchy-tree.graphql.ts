import { query } from '../../config/db';

export const hierarchyTreeTypes = `
  type HierarchyTask {
    taskId: Int!
    taskName: String!
    status: String!
    ownerId: Int
    parentId: Int
  }

  type HierarchyProgram {
    programId: Int!
    programName: String!
    type: String
    status: String
  }

  type HierarchyEvent {
    eventId: Int!
    eventName: String!
    programs: [HierarchyProgram!]!
    tasks: [HierarchyTask!]!
  }

  type HierarchyCommittee {
    committeeId: Int!
    committeeName: String!
    logo: String
    events: [HierarchyEvent!]!
  }

  type HierarchyRole {
    roleName: String!
    committees: [HierarchyCommittee!]!
  }
`;

export const hierarchyTreeQueryFields = `
    adminHierarchyTree: [HierarchyRole!]!
`;

export const hierarchyTreeResolvers = {
  Query: {
    async adminHierarchyTree(_: any, __: any, context: any) {
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
      const loggedInUserId = Number(decoded?.id);
      if (!loggedInUserId) {
        throw new Error('Unauthorized: Invalid token');
      }

      // Helper function to build hierarchy for committees
      const buildHierarchy = async (committeeIds: number[]): Promise<any[]> => {
        if (committeeIds.length === 0) return [];

        const placeholders = committeeIds.map(() => '?').join(',');

        // Fetch events for these committees
        const events = await query<any[]>(`
          SELECT id AS eventId, committee_id AS committeeId, name AS eventName
          FROM events
          WHERE committee_id IN (${placeholders})
          ORDER BY name ASC
        `, committeeIds);

        const eventIds = events.map((e: any) => e.eventId);
        let programs: any[] = [];
        let tasks: any[] = [];

        if (eventIds.length > 0) {
          const eventPlaceholders = eventIds.map(() => '?').join(',');

          // Fetch programs by event_id
          programs = await query<any[]>(`
            SELECT id AS programId, event_id AS eventId, name AS programName, type, status
            FROM programs
            WHERE event_id IN (${eventPlaceholders})
            ORDER BY name ASC
          `, eventIds);

          // Fetch tasks by event_id (NOT program_id)
          tasks = await query<any[]>(`
            SELECT id AS taskId, event_id AS eventId, parent_id AS parentId, name, owner_id AS ownerId, status
            FROM tasks
            WHERE event_id IN (${eventPlaceholders})
            ORDER BY parent_id ASC, name ASC
          `, eventIds);
        }

        // Group programs by event
        const programsByEvent = programs.reduce((acc: Record<number, any[]>, p: any) => {
          if (!acc[p.eventId]) acc[p.eventId] = [];
          acc[p.eventId].push({
            programId: p.programId,
            programName: p.programName,
            type: p.type || '',
            status: p.status || ''
          });
          return acc;
        }, {});

        // Group tasks by event
        const tasksByEvent = tasks.reduce((acc: Record<number, any[]>, t: any) => {
          if (!acc[t.eventId]) acc[t.eventId] = [];
          acc[t.eventId].push({
            taskId: t.taskId,
            taskName: t.name,
            status: t.status || '',
            ownerId: t.ownerId,
            parentId: t.parentId
          });
          return acc;
        }, {});

        // Group events by committee
        const eventsByCommittee = events.reduce((acc: Record<number, any[]>, e: any) => {
          if (!acc[e.committeeId]) acc[e.committeeId] = [];
          acc[e.committeeId].push({
            eventId: e.eventId,
            eventName: e.eventName,
            programs: programsByEvent[e.eventId] || [],
            tasks: tasksByEvent[e.eventId] || []
          });
          return acc;
        }, {});

        return committeeIds.map(id => {
          return {
            committeeId: id,
            events: eventsByCommittee[id] || []
          };
        });
      };

      // Fetch all committees where user is admin
      const adminCommittees = await query<any[]>(`
        SELECT c.id AS committeeId, c.committee_name AS committeeName, c.logo
        FROM committees c
        INNER JOIN committee_members cm ON c.id = cm.committee_id
        WHERE cm.user_id = ? AND cm.is_committee_admin = 1 AND cm.membership_status = 'ACCEPTED'
        ORDER BY c.committee_name ASC
      `, [loggedInUserId]);

      // Fetch all committees where user is only a member (not admin)
      const memberCommittees = await query<any[]>(`
        SELECT c.id AS committeeId, c.committee_name AS committeeName, c.logo
        FROM committees c
        INNER JOIN committee_members cm ON c.id = cm.committee_id
        WHERE cm.user_id = ? AND cm.is_committee_admin = 0 AND cm.membership_status = 'ACCEPTED'
        ORDER BY c.committee_name ASC
      `, [loggedInUserId]);

      // Build admin hierarchy
      const adminCommitteeIds = adminCommittees.map((c: any) => c.committeeId);
      let adminHierarchy = await buildHierarchy(adminCommitteeIds);
      
      // Populate committee details in admin hierarchy
      const adminCommitteesTree = adminCommittees.map((c: any) => {
        const hierData = adminHierarchy.find((h: any) => h.committeeId === c.committeeId);
        return {
          committeeId: c.committeeId,
          committeeName: c.committeeName,
          logo: c.logo || null,
          events: hierData?.events || []
        };
      });

      // Build member hierarchy
      const memberCommitteeIds = memberCommittees.map((c: any) => c.committeeId);
      let memberHierarchy = await buildHierarchy(memberCommitteeIds);
      
      // Populate committee details in member hierarchy
      const memberCommitteesTree = memberCommittees.map((c: any) => {
        const hierData = memberHierarchy.find((h: any) => h.committeeId === c.committeeId);
        return {
          committeeId: c.committeeId,
          committeeName: c.committeeName,
          logo: c.logo || null,
          events: hierData?.events || []
        };
      });

      // Return both roles
      return [
        { roleName: 'Admin Roles', committees: adminCommitteesTree },
        { roleName: 'Member Roles', committees: memberCommitteesTree }
      ];
    }
  }
};
