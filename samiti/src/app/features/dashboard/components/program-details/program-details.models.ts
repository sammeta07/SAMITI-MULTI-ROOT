import { TodoAssignee, TodoItem } from '../../models/todo.models';

export interface ProgramChild {
  programId: number;
  programName: string;
  startDate: string | null;
  endDate: string | null;
  visibility: string;
}

export interface ProgramDetailsPayload {
  id: number;
  programId: number;
  eventId?: number | null;
  parentProgramId?: number | null;
  parentProgramName?: string | null;
  programName: string;
  programBanner?: string | null;
  bannerImages: string[];
  address?: string | null;
  visibility?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  createdBy?: number | null;
  createdByName?: string | null;
  updatedBy?: number | null;
  updatedByName?: string | null;
  createdAt?: string | null;
  ownerUserId?: number | null;
  ownerName?: string | null;
  ownerDesignation?: string | null;
  ownerDesignationColor?: string | null;
  ownerDesignationIcon?: string | null;
  ownerAssignedBy?: number | null;
  ownerAssignedAt?: string | null;
  canAssignOwner: boolean;
  todos: TodoItem[];
  todoAssignees: TodoAssignee[];
  canManageTodos: boolean;
  canToggleTodos: boolean;
  canCreateSubprogram: boolean;
  subprograms: ProgramChild[];
  price: number;
}
