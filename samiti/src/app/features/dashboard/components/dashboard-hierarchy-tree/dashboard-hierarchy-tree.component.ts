import {
  ChangeDetectorRef,
  Component,
  effect,
  EventEmitter,
  inject,
  OnInit,
  Output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { MatTreeModule, MatTreeNestedDataSource } from '@angular/material/tree';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { HttpErrorResponse } from '@angular/common/http';
import { filter } from 'rxjs/operators';
import { DashboardHierarchyTreeService } from './dashboard-hierarchy-tree.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { LoadingStateService } from '../../../../shared/services/loading-state.service';
import { AdminHierarchyTreeNode, RoleNode, TreeNode } from './dashboard-hierarchy-tree.models';
import { sanitizeCloudinaryLogoUrl } from '../../../../shared/services/cloudinary-logo.util';
import { SelectedYearService } from '../../../../shared/services/selected-year.service';
import { getEventComputedStatus } from '../../../../shared/services/event-status.util';

@Component({
  selector: 'app-dashboard-hierarchy-tree',
  standalone: true,
  imports: [
    CommonModule,
    MatTreeModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule
  ],
  templateUrl: './dashboard-hierarchy-tree.html',
  styleUrl: './dashboard-hierarchy-tree.scss'
})
export class DashboardHierarchyTreeComponent implements OnInit {
  private readonly treeService = inject(DashboardHierarchyTreeService);
  private readonly notifier = inject(NotifierService);
  private readonly router = inject(Router);
  private readonly selectedYearService = inject(SelectedYearService);
  private readonly loadingState = inject(LoadingStateService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly routeRefreshAttempts = new Set<string>();

  public readonly isLoading = signal<boolean>(false);
  public readonly isNavigating = signal<boolean>(false);
  private awaitingDestinationLoad = false;
  private destinationLoadBegun = false;
  private navigateTimeout: ReturnType<typeof setTimeout> | null = null;
  private static readonly NAVIGATING_GUARD_TIMEOUT_MS = 12000;

  private readonly releaseNavigatingGuard = effect(() => {
    const loading = this.loadingState.isLoading();
    if (this.awaitingDestinationLoad) {
      if (loading) {
        this.destinationLoadBegun = true;
        this.isNavigating.set(true);
      } else if (this.destinationLoadBegun) {
        this.isNavigating.set(false);
        this.awaitingDestinationLoad = false;
        this.destinationLoadBegun = false;
        if (this.navigateTimeout) {
          clearTimeout(this.navigateTimeout);
          this.navigateTimeout = null;
        }
      }
    }
    return loading;
  });

  private readonly selectedNode = signal<TreeNode | null>(null);
  private readonly highlightedNodeToken = signal<string>('');

  private readonly currentYear = new Date().getFullYear();
  public readonly availableYears = signal<number[]>(
    Array.from({ length: 10 }, (_, i) => this.currentYear - i)
  );
  public readonly selectedYear = this.selectedYearService.selectedYear;

  public readonly activeStaticMenu = signal<string | null>('home');
  public readonly isRequestsMenuOpen = signal<boolean>(true);
  public readonly hasCommitteesHierarchy = signal<boolean>(false);
  @Output() staticMenuSelected = new EventEmitter<void>();
  @Output() treeNodeSelected = new EventEmitter<TreeNode>();

  public readonly expandedNodeKeys = signal<Set<string>>(new Set());
  public readonly childrenAccessor = (node: TreeNode) => node.children ?? [];
  public readonly dataSource = new MatTreeNestedDataSource<TreeNode>();

  private readonly treeRefreshEffect = effect(() => {
    const refreshCounter = this.treeService.refreshHierarchyTree();
    if (refreshCounter > 0) {
      this.fetchAdminNavigationTree();
    }
  });

  ngOnInit(): void {
    this.fetchAdminNavigationTree();

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.syncActiveNodeFromRawUrl();
    });
  }

  public hasChild = (_: number, node: TreeNode): boolean => !!node.children && node.children.length > 0;

  public onYearChange(year: number): void {
    this.selectedYear.set(year);
    this.treeService.triggerHierarchyTreeRefresh();
  }

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
    this.cdr.markForCheck();
  }

  private fetchAdminNavigationTree(): void {
    this.isLoading.set(true);
    
    this.treeService.getAdminHierarchyTree(this.selectedYear()).subscribe({
      next: (treeData) => {
        const transformedTree = this.transformBackendToTreeNode(treeData || []);
        
        // Data refresh sequence for MatTreeNestedDataSource
        this.dataSource.data = [];
        this.dataSource.data = [...transformedTree];
        this.hasCommitteesHierarchy.set(transformedTree.length > 0);
        this.expandAllTreeNodes();
        this.isLoading.set(false);
        this.syncActiveNodeFromRawUrl();
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Server context transmission exception.');
        this.isLoading.set(false);
        this.cdr.markForCheck();
      }
    });
  }

  private transformBackendToTreeNode(rolesData: RoleNode[]): TreeNode[] {
    return (rolesData || [])
      .map((role): TreeNode => {
        const roleScope = this.resolveRoleScope(role.roleName);

        return {
          name: role.roleName || 'Committee Roles',
          type: 'role',
          roleScope: roleScope ?? undefined,
          children: (role.committees || [])
            .map((committeeNode) => this.mapAdminNodeToTreeNode(committeeNode, roleScope))
            .filter((treeNode): treeNode is TreeNode => Boolean(treeNode))
        };
      })
      .filter((roleNode) => (roleNode.children?.length || 0) > 0)
      .filter((node): node is TreeNode => Boolean(node));
  }

  private mapAdminNodeToTreeNode(
    node: AdminHierarchyTreeNode,
    roleScope: 'master_admin' | 'admin' | 'member' | null
  ): TreeNode | null {
    const mappedType = this.mapBackendTypeToTreeType(node.type, node.id);
    if (!mappedType) {
      return null;
    }

    const mappedChildren = (node.children || [])
      .map((childNode) => this.mapAdminNodeToTreeNode(childNode, roleScope))
      .filter((childNode): childNode is TreeNode => Boolean(childNode));

    this.sortTreeChildren(mappedChildren);

    return {
      name: node.name,
      type: mappedType,
      id: this.extractNumericId(node.id),
      logo: (mappedType === 'group' || mappedType === 'event') ? sanitizeCloudinaryLogoUrl(node.logo || null) : null,
      roleScope: roleScope ?? undefined,
      roles: node.roles || undefined,
      startDate: node.startDate ?? undefined,
      endDate: node.endDate ?? undefined,
      startTime: node.startTime ?? undefined,
      endTime: node.endTime ?? undefined,
      children: mappedChildren.length > 0 ? mappedChildren : undefined
    };
  }

  private resolveRoleScope(roleName: string | undefined): 'master_admin' | 'admin' | 'member' | null {
    const normalizedRoleName = (roleName || '').trim().toLowerCase();

    if (normalizedRoleName.includes('master')) {
      return 'master_admin';
    }

    if (normalizedRoleName.includes('admin')) {
      return 'admin';
    }

    if (normalizedRoleName.includes('member')) {
      return 'member';
    }

    return null;
  }

  public getEventStatus(node: TreeNode): string {
    return getEventComputedStatus(node.startDate, node.endDate);
  }

  private mapBackendTypeToTreeType(typeValue: string, nodeId: string): TreeNode['type'] | null {
    const normalizedType = (typeValue || '').trim().toUpperCase();

    if (normalizedType === 'ROLE') return 'role';
    if (normalizedType === 'COMMITTEE' || normalizedType === 'GROUP') return 'group';
    if (normalizedType === 'EVENT') return 'event';
    if (normalizedType === 'PROGRAM') return 'program';
    if (normalizedType === 'TASK') return 'task';

    if (nodeId.startsWith('committee_')) return 'group';
    if (nodeId.startsWith('event_')) return 'event';
    if (nodeId.startsWith('program_')) return 'program';
    if (nodeId.startsWith('task_')) return 'task';

    return null;
  }

  private extractNumericId(rawId: string): number | undefined {
    if (!rawId) {
      return undefined;
    }

    const directNumeric = Number(rawId);
    if (!Number.isNaN(directNumeric)) {
      return directNumeric;
    }

    const idParts = rawId.split('_') as string[];
    const trailingSegment = idParts[idParts.length - 1] as string;
    const parsedId = Number(trailingSegment);
    return Number.isNaN(parsedId) ? undefined : parsedId;
  }

  private sortTreeChildren(nodes: TreeNode[]): void {
    const statusOrder: Record<string, number> = {
      COMPLETED: 0,
      STARTED: 1,
      UPCOMING: 2
    };

    nodes.sort((left, right) => {
      const isLeftEvent = left.type === 'event';
      const isRightEvent = right.type === 'event';
      const isLeftProgram = left.type === 'program';
      const isRightProgram = right.type === 'program';

      if ((isLeftEvent && isRightEvent) || (isLeftProgram && isRightProgram)) {
        const leftStatus = this.getEventStatus(left);
        const rightStatus = this.getEventStatus(right);
        const leftOrder = statusOrder[leftStatus] ?? 99;
        const rightOrder = statusOrder[rightStatus] ?? 99;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        const leftDate = left.startDate ?? '';
        const rightDate = right.startDate ?? '';

        if (leftDate !== rightDate) {
          if (!leftDate) return 1;
          if (!rightDate) return -1;
          return leftDate < rightDate ? -1 : 1;
        }

        if (isLeftProgram && isRightProgram) {
          const leftEndDate = left.endDate ?? '';
          const rightEndDate = right.endDate ?? '';
          if (leftEndDate !== rightEndDate) {
            if (!leftEndDate) return 1;
            if (!rightEndDate) return -1;
            return leftEndDate < rightEndDate ? -1 : 1;
          }
        }

        return left.name.localeCompare(right.name);
      }

      return left.name.localeCompare(right.name);
    });
  }

  private syncActiveNodeFromRawUrl(): void {
    const currentUrl = this.router.url;
    const parsedUrl = this.router.parseUrl(currentUrl);
    const shouldAutoOpenFirstNode = parsedUrl.queryParams?.['autoOpenFirstNode'] === '1';
    const [pathOnly] = currentUrl.split('?');
    const urlSegments = pathOnly.split('/');
    let typeParam: string | null = null;
    let idParam: string | null = null;
    
    if (urlSegments.includes('home')) {
      if (shouldAutoOpenFirstNode && this.tryOpenFirstHierarchyNode()) {
        this.isLoading.set(false);
        return;
      }

      this.activeStaticMenu.set('home');
      this.selectedNode.set(null);
      this.isLoading.set(false);
      return;
    } else if (urlSegments.includes('requests')) {
      const requestsIndex = urlSegments.indexOf('requests');
      const subRoute = requestsIndex >= 0 && urlSegments.length > requestsIndex + 1 ? urlSegments[requestsIndex + 1] : null;

      if (subRoute === 'sent') {
        this.activeStaticMenu.set('requests-sent');
      } else if (subRoute === 'received') {
        this.activeStaticMenu.set('requests-received');
      } else {
        this.activeStaticMenu.set('requests');
      }

      this.isRequestsMenuOpen.set(true);
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
      const routeSelectionKey = `${typeParam}:${targetId}`;

      if (matchedNode) {
        this.activeStaticMenu.set(null);
        this.selectedNode.set(matchedNode);
        this.triggerNodeHighlight(matchedNode);
        this.expandAncestorsChain(this.dataSource.data, matchedNode);
        this.routeRefreshAttempts.delete(routeSelectionKey);
        this.scrollSelectedNodeIntoView();
        this.isLoading.set(false);
        this.cdr.markForCheck();
        return;
      }

      if (!this.routeRefreshAttempts.has(routeSelectionKey)) {
        this.routeRefreshAttempts.add(routeSelectionKey);
        this.fetchAdminNavigationTree();
        return;
      }
    }

    if (this.dataSource.data.length > 0 && !this.selectedNode() && !this.activeStaticMenu()) {
      if (shouldAutoOpenFirstNode && this.tryOpenFirstHierarchyNode()) {
        this.isLoading.set(false);
        return;
      }

      if (this.isDashboardRootRoute(urlSegments)) {
        this.onSelectStaticMenu('home');
      }
    }
    this.isLoading.set(false);
    this.cdr.markForCheck();
  }

  private isDashboardRootRoute(urlSegments: string[]): boolean {
    const cleanedSegments = urlSegments.filter((segment) => segment.length > 0);
    return cleanedSegments.length === 1 && cleanedSegments[0] === 'dashboard';
  }

  private tryOpenFirstHierarchyNode(): boolean {
    const firstNavigableNode = this.findFirstNavigableNode(this.dataSource.data);
    if (!firstNavigableNode || !firstNavigableNode.id) {
      return false;
    }

    this.activeStaticMenu.set(null);
    this.selectedNode.set(firstNavigableNode);
    this.triggerNodeHighlight(firstNavigableNode);
    this.expandAncestorsChain(this.dataSource.data, firstNavigableNode);
    this.scrollSelectedNodeIntoView();

    this.router.navigate(['/dashboard', firstNavigableNode.type, firstNavigableNode.id], {
      queryParams: {
        autoOpenFirstNode: null
      },
      queryParamsHandling: 'merge'
    });

    return true;
  }

  private findFirstNavigableNode(nodes: TreeNode[]): TreeNode | null {
    for (const node of nodes) {
      if ((node.type === 'group' || node.type === 'event') && node.id) {
        return node;
      }

      if (node.children && node.children.length > 0) {
        const nestedNode = this.findFirstNavigableNode(node.children);
        if (nestedNode) {
          return nestedNode;
        }
      }
    }

    return null;
  }

  private scrollSelectedNodeIntoView(): void {
    setTimeout(() => {
      const selectedTreeNodeElement = document.querySelector(
        '.samiti-fluent-tree .node-interactive-strip.is-selected'
      ) as HTMLElement | null;
      const treeViewportElement = document.querySelector('.tree-scroll-viewport') as HTMLElement | null;

      if (!selectedTreeNodeElement || !treeViewportElement) {
        return;
      }

      const viewportRect = treeViewportElement.getBoundingClientRect();
      const selectedRect = selectedTreeNodeElement.getBoundingClientRect();
      const currentScrollTop = treeViewportElement.scrollTop;
      const targetScrollTop =
        currentScrollTop +
        (selectedRect.top - viewportRect.top) -
        (viewportRect.height / 2 - selectedRect.height / 2);

      treeViewportElement.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      });
    }, 0);
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
      this.cdr.markForCheck();
    }
  }

  public onSelectStaticMenu(menuType: 'home' | 'requests' | 'requests-sent' | 'requests-received'): void {
    if (menuType === 'requests') return;

    this.selectedNode.set(null);
    this.activeStaticMenu.set(menuType);
    this.staticMenuSelected.emit();
    this.isRequestsMenuOpen.set(true);

    const segments = menuType === 'home' ? ['home'] : ['requests', menuType.replace('requests-', '')];

    this.router.navigate(['/dashboard', ...segments]);
  }

  public toggleRequestsMenu(): void {
    this.isRequestsMenuOpen.update(open => !open);
    this.cdr.markForCheck();
  }

  public isNodeSelected(node: TreeNode): boolean {
    if (this.activeStaticMenu()) return false;
    const selected = this.selectedNode();
    if (!selected) return false;
    return selected.id === node.id && selected.type === node.type;
  }

  public isNodeHighlighted(node: TreeNode): boolean {
    const nodeKey = this.getNodeKey(node);
    return this.highlightedNodeToken().startsWith(`${nodeKey}::`);
  }

  public onNodeClick(node: TreeNode): void {
    if (node.type === 'role') {
      return;
    }

    if (this.isNodeSelected(node)) {
      return;
    }

    if (this.isNavigating()) {
      return;
    }

    this.activeStaticMenu.set(null);
    this.selectedNode.set(node);
    this.triggerNodeHighlight(node);

    if (node.type === 'group' || node.type === 'event' || node.type === 'program' || node.type === 'task') {
      if (!node.id) {
        this.notifier.warn(`Unable to open ${node.type} details.`);
        this.treeNodeSelected.emit(node);
        return;
      }

      this.isNavigating.set(true);
      this.awaitingDestinationLoad = true;
      this.destinationLoadBegun = false;
      if (this.navigateTimeout) {
        clearTimeout(this.navigateTimeout);
      }
      this.navigateTimeout = setTimeout(() => {
        if (this.isNavigating()) {
          this.isNavigating.set(false);
          this.awaitingDestinationLoad = false;
          this.destinationLoadBegun = false;
        }
        this.navigateTimeout = null;
      }, DashboardHierarchyTreeComponent.NAVIGATING_GUARD_TIMEOUT_MS);
      this.router.navigate(['/dashboard', node.type, node.id]).then((success) => {
        if (!success) {
          this.notifier.error(`Unable to open ${node.type} details.`);
          this.isNavigating.set(false);
          this.awaitingDestinationLoad = false;
          this.destinationLoadBegun = false;
          if (this.navigateTimeout) {
            clearTimeout(this.navigateTimeout);
            this.navigateTimeout = null;
          }
        }
      }).catch(() => {
        this.isNavigating.set(false);
        this.awaitingDestinationLoad = false;
        this.destinationLoadBegun = false;
        if (this.navigateTimeout) {
          clearTimeout(this.navigateTimeout);
          this.navigateTimeout = null;
        }
      });
      this.treeNodeSelected.emit(node);
      return;
    }

    this.notifier.info(`Detailed page is not available yet for ${node.type}.`);
    this.treeNodeSelected.emit(node);
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

  private triggerNodeHighlight(node: TreeNode): void {
    const nodeKey = this.getNodeKey(node);
    this.highlightedNodeToken.set(`${nodeKey}::${Date.now()}`);

    setTimeout(() => {
      if (this.highlightedNodeToken().startsWith(`${nodeKey}::`)) {
        this.highlightedNodeToken.set('');
        this.cdr.markForCheck();
      }
    }, 1400);
  }

  public executeAction(actionType: 'view' | 'edit' | 'delete', node: TreeNode, event: Event): void {
    event.stopPropagation();
    this.notifier.success(`${actionType.toUpperCase()} pipeline fired for ${node.name}`);
  }

  public getNodeInitial(name: string | undefined): string {
    return String(name || '').trim().charAt(0).toUpperCase() || '?';
  }

  public formatProgramTime(value: string): string {
    const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
      return value;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      return value;
    }

    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  public formatDisplayDate(value: string): string {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return value;
    }

    const year = match[1];
    const month = Number(match[2]);
    const day = match[3];

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[month - 1] || match[2];

    return `${day}-${monthName}-${year.slice(-2)}`;
  }

  public formatProgramDateRange(startDate: string, endDate: string): string {
    const startMatch = startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const endMatch = endDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (startMatch && endMatch && startMatch[1] === endMatch[1] && startMatch[2] === endMatch[2]) {
      return `${startMatch[3]} - ${this.formatDisplayDate(endDate)}`;
    }

    return `${this.formatDisplayDate(startDate)} to ${this.formatDisplayDate(endDate)}`;
  }

  public getNodeDesignation(node: TreeNode): string | null {
    if (!node.roleScope || node.roleScope === 'member') {
      return null;
    }
    if (node.type === 'group') {
      return null;
    }
    return node.roleScope === 'master_admin' ? 'Master Admin' : 'Admin';
  }

  public shouldShowEventRole(node: TreeNode): boolean {
    if (node.type !== 'event' || !node.roles?.length) {
      return false;
    }
    const firstRole = node.roles[0];
    if (!firstRole) {
      return false;
    }
    const normalized = firstRole.name.trim().toLowerCase();
    return !(normalized === 'member' || normalized === '');
  }

  public getCommitteeLogoRoleClass(node: TreeNode): string {
    if (node.type !== 'group' || !node.roles?.length) {
      return '';
    }
    const roleSet = new Set(
      node.roles.map((role) => String(role?.name || '').trim().toUpperCase()).filter(Boolean)
    );
    if (roleSet.has('COMMITTEE_MASTER_ADMIN')) {
      return 'committee-role-master_admin';
    }
    if (roleSet.has('COMMITTEE_ADMIN')) {
      return 'committee-role-admin';
    }
    if (roleSet.has('COMMITTEE_MEMBER')) {
      return 'committee-role-member';
    }
    return '';
  }

  public getEventDesignationColor(node: TreeNode): string {
    if (node.type !== 'event' || !node.roles?.length) {
      return '#64748b';
    }
    const firstRole = node.roles[0];
    if (!firstRole) {
      return '#64748b';
    }
    const normalized = firstRole.name.trim().toLowerCase();
    if (normalized === 'member' || normalized === '') {
      return '#64748b';
    }
    return firstRole.color || '#64748b';
  }

  public getEventRoleIcon(node: TreeNode): string | null {
    if (node.type !== 'event' || !node.roles?.length) {
      return null;
    }
    const firstRole = node.roles[0];
    if (!firstRole) {
      return null;
    }
    const normalized = firstRole.name.trim().toLowerCase();
    if (normalized === 'member' || normalized === '') {
      return null;
    }
    return firstRole.icon || null;
  }

  public getEventRoleName(node: TreeNode): string | null {
    if (node.type !== 'event' || !node.roles?.length) {
      return null;
    }
    const firstRole = node.roles[0];
    if (!firstRole) {
      return null;
    }
    const normalized = firstRole.name.trim().toLowerCase();
    if (normalized === 'member' || normalized === '') {
      return null;
    }
    return firstRole.name;
  }
}