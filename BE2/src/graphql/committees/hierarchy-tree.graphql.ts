import { query } from '../../config/db';
import { hasEventsDisplayNameColumn } from '../events/event-display-name-support';

export const hierarchyTreeTypes = `
  type HierarchyTreeNode {
    id: String!
    name: String!
    type: String!
    logo: String
    roles: [String!]!
    children: [HierarchyTreeNode!]!
  }

  type HierarchyRole {
    roleName: String!
    committees: [HierarchyTreeNode!]!
  }
`;

export const hierarchyTreeQueryFields = `
    adminHierarchyTree: [HierarchyRole!]!
`;

type InternalTreeNode = {
  id: string;
  name: string;
  type: string;
  logo: string | null;
  roles: Set<string>;
  children: InternalTreeNode[];
  childIds: Set<string>;
};

export type SerializedHierarchyTreeNode = {
  id: string;
  name: string;
  type: string;
  logo: string | null;
  roles: string[];
  children: SerializedHierarchyTreeNode[];
};

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

      const committeeRows = await query<any[]>(
        `SELECT
           c.id AS committee_id,
           c.committee_name,
           c.logo,
           cm.is_committee_admin,
           cm.is_committee_member
         FROM users_committees cm
         INNER JOIN committees c ON c.id = cm.committee_id
         WHERE cm.user_id = ?
           AND (
             COALESCE(cm.is_committee_admin, 0) = 1
             OR COALESCE(cm.is_committee_member, 0) = 1
           )
         ORDER BY c.committee_name ASC`,
        [loggedInUserId]
      );

      if (committeeRows.length === 0) {
        return [];
      }

      const committeeNodeById = new Map<number, InternalTreeNode>();
      const adminCommitteeIds = new Set<number>();
      const memberOnlyCommitteeIds = new Set<number>();
      const eventNodeById = new Map<number, InternalTreeNode>();
      const eventRoleSetById = new Map<number, Set<string>>();

      const attachChild = (parentNode: InternalTreeNode, childNode: InternalTreeNode) => {
        if (!parentNode.childIds.has(childNode.id)) {
          parentNode.children.push(childNode);
          parentNode.childIds.add(childNode.id);
        }
      };

      for (const row of committeeRows) {
        const committeeId = Number(row.committee_id);
        const existingNode = committeeNodeById.get(committeeId);
        const committeeNode = existingNode || {
          id: `committee_${committeeId}`,
          name: String(row.committee_name),
          type: 'COMMITTEE',
          logo: row.logo ? String(row.logo) : null,
          roles: new Set<string>(),
          children: [],
          childIds: new Set<string>()
        };

        if (Number(row.is_committee_admin) === 1) {
          committeeNode.roles.add('ADMIN');
          adminCommitteeIds.add(committeeId);
        }
        if (Number(row.is_committee_member) === 1 && Number(row.is_committee_admin) !== 1) {
          memberOnlyCommitteeIds.add(committeeId);
        }
        if (Number(row.is_committee_member) === 1) {
          committeeNode.roles.add('MEMBER');
        }

        committeeNodeById.set(committeeId, committeeNode);
      }

      const committeeIds = Array.from(committeeNodeById.keys());
      const committeePlaceholders = committeeIds.map(() => '?').join(',');
      const supportsEventDisplayName = await hasEventsDisplayNameColumn();

      const eventRows = await query<any[]>(
        `SELECT
           id AS event_id,
           committee_id,
           ${supportsEventDisplayName ? "COALESCE(NULLIF(TRIM(display_name), ''), LEFT(name, 20))" : 'LEFT(name, 20)'} AS event_name
         FROM events
         WHERE committee_id IN (${committeePlaceholders})
         ORDER BY name ASC`,
        committeeIds
      );

      const eventIds = eventRows.map((eventRow) => Number(eventRow.event_id));

      if (eventIds.length > 0) {
        const eventPlaceholders = eventIds.map(() => '?').join(',');

        const eventRoleRows = await query<any[]>(
          `SELECT
             event_id,
             designation
           FROM users_events
           WHERE user_id = ?
             AND event_id IN (${eventPlaceholders})`,
          [loggedInUserId, ...eventIds]
        );

        for (const eventRoleRow of eventRoleRows) {
          const eventId = Number(eventRoleRow.event_id);
          if (!eventRoleSetById.has(eventId)) {
            eventRoleSetById.set(eventId, new Set<string>());
          }

          const roleValue = String(eventRoleRow.designation || '').trim();
          if (roleValue) {
            eventRoleSetById.get(eventId)!.add(roleValue.toUpperCase());
          } else {
            eventRoleSetById.get(eventId)!.add('MEMBER');
          }
        }

        for (const eventRow of eventRows) {
          const eventId = Number(eventRow.event_id);
          const eventNode: InternalTreeNode = {
            id: `event_${eventId}`,
            name: String(eventRow.event_name),
            type: 'EVENT',
            logo: null,
            roles: eventRoleSetById.get(eventId) || new Set<string>(),
            children: [],
            childIds: new Set<string>()
          };

          eventNodeById.set(eventId, eventNode);

          const committeeId = Number(eventRow.committee_id);
          const committeeNode = committeeNodeById.get(committeeId);
          if (committeeNode) {
            attachChild(committeeNode, eventNode);
          }
        }

        const programRows = await query<any[]>(
          `SELECT
             id AS program_id,
             event_id,
             name AS program_name
           FROM programs
           WHERE event_id IN (${eventPlaceholders})
           ORDER BY name ASC`,
          eventIds
        );

        for (const programRow of programRows) {
          const eventId = Number(programRow.event_id);
          const eventNode = eventNodeById.get(eventId);
          if (!eventNode) {
            continue;
          }

          const programNode: InternalTreeNode = {
            id: `program_${Number(programRow.program_id)}`,
            name: String(programRow.program_name),
            type: 'PROGRAM',
            logo: null,
            roles: new Set<string>(),
            children: [],
            childIds: new Set<string>()
          };

          attachChild(eventNode, programNode);
        }

        const taskRows = await query<any[]>(
          `SELECT
             id AS task_id,
             event_id,
             parent_id,
             name AS task_name,
             owner_id
           FROM tasks
           WHERE event_id IN (${eventPlaceholders})
           ORDER BY parent_id ASC, name ASC`,
          eventIds
        );

        const taskNodeById = new Map<number, InternalTreeNode>();

        for (const taskRow of taskRows) {
          const taskId = Number(taskRow.task_id);
          const eventId = Number(taskRow.event_id);
          const isOwner = Number(taskRow.owner_id) === loggedInUserId;
          const hasEventMembership = (eventRoleSetById.get(eventId)?.size || 0) > 0;
          const taskRoles = new Set<string>();

          if (isOwner) {
            taskRoles.add('OWNER');
          } else if (hasEventMembership) {
            taskRoles.add('ASSIGNED');
          }

          const taskNode: InternalTreeNode = {
            id: `task_${taskId}`,
            name: String(taskRow.task_name),
            type: 'TASK',
            logo: null,
            roles: taskRoles,
            children: [],
            childIds: new Set<string>()
          };

          taskNodeById.set(taskId, taskNode);
        }

        for (const taskRow of taskRows) {
          const taskId = Number(taskRow.task_id);
          const parentId = taskRow.parent_id ? Number(taskRow.parent_id) : null;
          const eventId = Number(taskRow.event_id);
          const taskNode = taskNodeById.get(taskId);
          if (!taskNode) {
            continue;
          }

          if (parentId && taskNodeById.has(parentId)) {
            attachChild(taskNodeById.get(parentId)!, taskNode);
            continue;
          }

          const eventNode = eventNodeById.get(eventId);
          if (eventNode) {
            attachChild(eventNode, taskNode);
          }
        }
      }

      const sortNodesByName = (nodes: InternalTreeNode[]) => {
        nodes.sort((leftNode, rightNode) => leftNode.name.localeCompare(rightNode.name));
        for (const node of nodes) {
          if (node.children.length > 0) {
            sortNodesByName(node.children);
          }
        }
      };

      const serializeNode = (node: InternalTreeNode): SerializedHierarchyTreeNode => ({
        id: node.id,
        name: node.name,
        type: node.type,
        logo: node.logo,
        roles: Array.from(node.roles),
        children: node.children.map((childNode) => serializeNode(childNode))
      });

      const committeeNodes = Array.from(committeeNodeById.values());
      sortNodesByName(committeeNodes);

      const serializedCommitteeById = new Map<number, SerializedHierarchyTreeNode>();
      for (const committeeNode of committeeNodes) {
        const numericCommitteeId = Number(committeeNode.id.split('_')[1]);
        serializedCommitteeById.set(numericCommitteeId, serializeNode(committeeNode));
      }

      const adminCommittees = Array.from(adminCommitteeIds)
        .map((committeeId) => serializedCommitteeById.get(committeeId))
        .filter((committeeNode): committeeNode is SerializedHierarchyTreeNode => Boolean(committeeNode));

      const memberCommittees = Array.from(memberOnlyCommitteeIds)
        .map((committeeId) => serializedCommitteeById.get(committeeId))
        .filter((committeeNode): committeeNode is SerializedHierarchyTreeNode => Boolean(committeeNode));

      return [
        { roleName: 'Admin Roles', committees: adminCommittees },
        { roleName: 'Member Roles', committees: memberCommittees }
      ];
    }
  }
};
