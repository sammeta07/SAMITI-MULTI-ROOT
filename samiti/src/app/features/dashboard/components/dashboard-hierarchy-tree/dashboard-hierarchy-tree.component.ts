import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { MatTreeModule, MatTreeNestedDataSource } from '@angular/material/tree';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpErrorResponse } from '@angular/common/http';
import { filter } from 'rxjs/operators';
import { DashboardHierarchyTreeService } from './dashboard-hierarchy-tree.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { RoleNode, TreeNode, CommitteeItem, EventItem, ProgramItem, TaskItem } from './dashboard-hierarchy-tree.models';

@Component({
  selector: 'app-dashboard-hierarchy-tree',
  standalone: true,
  imports: [
    CommonModule,
    MatTreeModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './dashboard-hierarchy-tree.html',
  styleUrl: './dashboard-hierarchy-tree.scss'
})
export class DashboardHierarchyTreeComponent implements OnInit {
  private readonly treeService = inject(DashboardHierarchyTreeService);
  private readonly notifier = inject(NotifierService);
  private readonly router = inject(Router);

  public readonly isLoading = signal<boolean>(false);
  public readonly selectedNode = signal<TreeNode | null>(null);
  
  // 🚀 FIXED: Dynamic signal tracking static navigation items from old dashboard
  public readonly activeStaticMenu = signal<string | null>('home');
  public readonly hasCommitteesHierarchy = signal<boolean>(false);

  public readonly expandedNodeKeys = signal<Set<string>>(new Set());
  public readonly childrenAccessor = (node: TreeNode) => node.children ?? [];
  public readonly dataSource = new MatTreeNestedDataSource<TreeNode>();

  ngOnInit(): void {
    this.fetchAdminNavigationTree();

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.syncActiveNodeFromRawUrl();
    });
  }

  public hasChild = (_: number, node: TreeNode): boolean => !!node.children && node.children.length > 0;

  public isNodeExpanded(node: TreeNode): boolean {
    return this.expandedNodeKeys().has(this.getNodeKey(node));
  }

  public toggleNodeExpansion(node: TreeNode, event: Event): void {
    event.stopPropagation();

    this.expandedNodeKeys.update((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      const nodeKey = this.getNodeKey(node);

      if (nextKeys.has(nodeKey)) {
        nextKeys.delete(nodeKey);
      } else {
        nextKeys.add(nodeKey);
      }

      return nextKeys;
    });
  }

  private fetchAdminNavigationTree(): void {
    this.isLoading.set(true);
    
    this.treeService.getAdminHierarchyTree().subscribe({
      next: (rolesData) => {
        const transformedTree = this.transformBackendToTreeNode(rolesData || []);
        this.dataSource.data = transformedTree;
        this.hasCommitteesHierarchy.set(transformedTree.length > 0);
        this.expandAllTreeNodes();
        this.isLoading.set(false);
        this.syncActiveNodeFromRawUrl();
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Server context transmission exception.');
        this.isLoading.set(false);
      }
    });
  }

  private transformBackendToTreeNode(rolesData: RoleNode[]): TreeNode[] {
    return rolesData
      .filter((role: RoleNode) => Array.isArray(role.committees) && role.committees.length > 0)
      .map((role: RoleNode): TreeNode => ({
      name: role.roleName || 'Committee Administrator Panel',
      type: 'role',
      children: (role.committees || []).map((committee: CommitteeItem): TreeNode => ({
        name: committee.committeeName,
        type: 'group',
        id: committee.committeeId,
        logo: committee.logo || null,
        children: (committee.events || []).map((event: EventItem): TreeNode => ({
          name: event.eventName,
          type: 'event',
          id: event.eventId,
          children: [
            // Add programs as children
            ...(event.programs || []).map((program: ProgramItem): TreeNode => ({
              name: program.programName,
              type: 'program',
              id: program.programId,
              status: program.status || undefined
            })),
            // Add tasks as children (main tasks with parentId === null or undefined)
            ...(event.tasks || [])
              .filter((task: TaskItem) => !task.parentId)
              .map((task: TaskItem): TreeNode => ({
                name: task.taskName,
                type: 'task',
                id: task.taskId,
                status: task.status,
                // Add subtasks if any exist
                children: (event.tasks || [])
                  .filter((subtask: TaskItem) => subtask.parentId === task.taskId)
                  .map((subtask: TaskItem): TreeNode => ({
                    name: subtask.taskName,
                    type: 'task',
                    id: subtask.taskId,
                    status: subtask.status
                  }))
              }))
          ]
        }))
      }))
    }));
  }

  private syncActiveNodeFromRawUrl(): void {
    const currentUrl = this.router.url;
    const [pathOnly] = currentUrl.split('?');
    const urlSegments = pathOnly.split('/');
    let typeParam: string | null = null;
    let idParam: string | null = null;
    
    if (urlSegments.includes('home')) {
      this.activeStaticMenu.set('home');
      this.selectedNode.set(null);
      this.isLoading.set(false);
      return;
    } else if (urlSegments.includes('requests')) {
      this.activeStaticMenu.set('requests');
      this.selectedNode.set(null);
      this.isLoading.set(false);
      return;
    }

    const validTypes = ['group', 'event', 'program', 'task'];
    for (let i = 0; i < urlSegments.length; i++) {
      if (validTypes.includes(urlSegments[i])) {
        typeParam = urlSegments[i];
        idParam = urlSegments[i + 1] ? urlSegments[i + 1].split('?')[0] : null;
        break;
      }
    }

    if (typeParam && idParam) {
      const targetId = Number(idParam);
      const matchedNode = this.findNodeInDeepTree(this.dataSource.data, typeParam, targetId);

      if (matchedNode) {
        this.activeStaticMenu.set(null); // Deselect static menus if tree item is matched
        this.selectedNode.set(matchedNode);
        this.expandAncestorsChain(this.dataSource.data, matchedNode);
        this.isLoading.set(false);
        return;
      }
    }

    // Default system landing node behavior definition
    if (this.dataSource.data.length > 0 && !this.selectedNode() && !this.activeStaticMenu()) {
      this.onSelectStaticMenu('home');
    }
    this.isLoading.set(false);
  }

  private findNodeInDeepTree(nodes: TreeNode[], type: string, id: number): TreeNode | null {
    for (const node of nodes) {
      if (node.type === type && node.id === id) return node;
      if (node.children) {
        const found = this.findNodeInDeepTree(node.children, type, id);
        if (found) return found;
      }
    }
    return null;
  }

  private expandAncestorsChain(rootNodes: TreeNode[], targetNode: TreeNode): void {
    const path: TreeNode[] = [];
    const findPath = (currentNodes: TreeNode[]): boolean => {
      for (const n of currentNodes) {
        path.push(n);
        if (n === targetNode) return true;
        if (n.children && findPath(n.children)) return true;
        path.pop();
      }
      return false;
    };

    if (findPath(rootNodes)) {
      this.expandedNodeKeys.update((currentKeys) => {
        const nextKeys = new Set(currentKeys);

        path.forEach(ancestor => {
          if (ancestor !== targetNode && ancestor.children && ancestor.children.length > 0) {
            nextKeys.add(this.getNodeKey(ancestor));
          }
        });

        return nextKeys;
      });
    }
  }

  // 🚀 FIXED: Static Menu selection handling logic to switch route viewports cleanly
  public onSelectStaticMenu(menuType: 'home' | 'requests'): void {
    this.selectedNode.set(null);
    this.activeStaticMenu.set(menuType);
    this.router.navigate(['/dashboard', menuType]).then(() => {
      console.log(`Successfully shifted application context viewport to static hub: [${menuType.toUpperCase()}]`);
    });
  }

  public isNodeSelected(node: TreeNode): boolean {
    if (this.activeStaticMenu()) return false;
    const selected = this.selectedNode();
    if (!selected) return false;
    return selected.id === node.id && selected.type === node.type;
  }

  public onNodeClick(node: TreeNode): void {
    if (node.type === 'role') return;

    this.activeStaticMenu.set(null); // Clear static highlights when tree node gets selected
    this.selectedNode.set(node);

    if (node.type === 'group' || node.type === 'event') {
      this.router.navigate(['/dashboard', node.type, node.id]).then((success) => {
        if (!success) {
          this.notifier.error(`Unable to open ${node.type} details.`);
        }
      });
      return;
    }

    this.notifier.info(`Detailed page is not available yet for ${node.type}.`);
  }

  private expandAllTreeNodes(): void {
    const expandedKeys = new Set<string>();

    const expandNodeRecursive = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.children && node.children.length > 0) {
          expandedKeys.add(this.getNodeKey(node));
          expandNodeRecursive(node.children);
        }
      });
    };

    expandNodeRecursive(this.dataSource.data);
    this.expandedNodeKeys.set(expandedKeys);
  }

  private getNodeKey(node: TreeNode): string {
    return `${node.type}:${node.id ?? node.name}`;
  }

  public executeAction(actionType: 'view' | 'edit' | 'delete', node: TreeNode, event: Event): void {
    event.stopPropagation();
    this.notifier.success(`${actionType.toUpperCase()} pipeline fired for ${node.name}`);
  }
}