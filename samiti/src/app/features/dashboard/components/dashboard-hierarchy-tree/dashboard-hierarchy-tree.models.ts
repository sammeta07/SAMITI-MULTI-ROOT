export interface AdminHierarchyTreeNode {
  id: string;
  name: string;
  type: string;
  logo?: string | null;
  roles: string[];
  children: AdminHierarchyTreeNode[];
}

export type CommitteeItem = AdminHierarchyTreeNode;

export interface RoleNode {
  roleName: string;
  committees: CommitteeItem[];
}

export interface CommitteeMember {
  id: number;
  name: string;
  email: string;
  isCommitteeAdmin: number;
}

export interface CommitteeDetailsPayload {
  id: number;
  committeeId: number;
  committeeName: string;
  description: string;
  address: string;
  establishYear: number;
  logo: string | null;
  contactNumbers: string[];
  createdBy: number;
  createdAt: string;
  isLoggedUserAdmin: boolean;
  members: CommitteeMember[];
}

export interface TreeNode {
  name: string;
  type: 'role' | 'group' | 'event' | 'program' | 'task';
  id?: number;
  children?: TreeNode[];
  status?: string;
  logo?: string | null;
  roleScope?: 'admin' | 'member';
}