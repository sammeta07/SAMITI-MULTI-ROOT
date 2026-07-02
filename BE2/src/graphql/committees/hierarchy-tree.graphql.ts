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
          SELECT id AS event_id, committee_id, name
          FROM events
          WHERE committee_id IN (${placeholders})
          ORDER BY name ASC
        `, committeeIds);

        const eventIds = events.map((e: any) => e.event_id);
        let programs: any[] = [];
        let tasks: any[] = [];

        if (eventIds.length > 0) {
          const eventPlaceholders = eventIds.map(() => '?').join(',');

          // Fetch programs by event_id
          programs = await query<any[]>(`
            SELECT id AS program_id, event_id, name, type, status
            FROM programs
            WHERE event_id IN (${eventPlaceholders})
            ORDER BY name ASC
          `, eventIds);

          // Fetch tasks by event_id (NOT program_id)
          tasks = await query<any[]>(`
            SELECT id AS task_id, event_id, parent_id, name, owner_id, status
            FROM tasks
            WHERE event_id IN (${eventPlaceholders})
            ORDER BY parent_id ASC, name ASC
          `, eventIds);
        }

        // Group programs by event
        const programsByEvent = programs.reduce((acc: Record<number, any[]>, p: any) => {
          if (!acc[p.event_id]) acc[p.event_id] = [];
          acc[p.event_id].push({
            programId: p.program_id,
            programName: p.program_name,
            type: p.type || '',
            status: p.status || ''
          });
          return acc;
        }, {});

        // Group tasks by event
        const tasksByEvent = tasks.reduce((acc: Record<number, any[]>, t: any) => {
          if (!acc[t.event_id]) acc[t.event_id] = [];
          acc[t.event_id].push({
            taskId: t.task_id,
            taskName: t.name,
            status: t.status || '',
            ownerId: t.owner_id,
            parentId: t.parent_id
          });
          return acc;
        }, {});

        // Group events by committee
        const eventsByCommittee = events.reduce((acc: Record<number, any[]>, e: any) => {
          if (!acc[e.committee_id]) acc[e.committee_id] = [];
          acc[e.committee_id].push({
            eventId: e.event_id,
            eventName: e.name,
            programs: programsByEvent[e.event_id] || [],
            tasks: tasksByEvent[e.event_id] || []
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
        SELECT c.id AS committee_id, c.committee_name, c.logo
        FROM committees c
        INNER JOIN committee_members cm ON c.id = cm.committee_id
        WHERE cm.user_id = ? AND cm.is_committee_admin = 1 AND cm.membership_status = 'ACCEPTED'
        ORDER BY c.committee_name ASC
      `, [loggedInUserId]);

      // Fetch all committees where user is only a member (not admin)
      const memberCommittees = await query<any[]>(`
        SELECT c.id AS committee_id, c.committee_name, c.logo
        FROM committees c
        INNER JOIN committee_members cm ON c.id = cm.committee_id
        WHERE cm.user_id = ? AND cm.is_committee_admin = 0 AND cm.membership_status = 'ACCEPTED'
        ORDER BY c.committee_name ASC
      `, [loggedInUserId]);

      // Build admin hierarchy
      const adminCommitteeIds = adminCommittees.map((c: any) => c.committee_id);
      let adminHierarchy = await buildHierarchy(adminCommitteeIds);
      
      // Populate committee details in admin hierarchy
      const adminCommitteesTree = adminCommittees.map((c: any) => {
        const hierData = adminHierarchy.find((h: any) => h.committeeId === c.committee_id);
        return {
          committeeId: c.committee_id,
          committeeName: c.committee_name,
          logo: c.logo || null,
          events: hierData?.events || []
        };
      });

      // Build member hierarchy
      const memberCommitteeIds = memberCommittees.map((c: any) => c.committee_id);
      let memberHierarchy = await buildHierarchy(memberCommitteeIds);
      
      // Populate committee details in member hierarchy
      const memberCommitteesTree = memberCommittees.map((c: any) => {
        const hierData = memberHierarchy.find((h: any) => h.committeeId === c.committee_id);
        return {
          committeeId: c.committee_id,
          committeeName: c.committee_name,
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
