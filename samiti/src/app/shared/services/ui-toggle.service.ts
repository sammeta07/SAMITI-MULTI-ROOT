import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UiToggleService {
  // =====================Groups/Programs=================
    private groupsPanelVisible = new BehaviorSubject<boolean>(true);
    isCommitteesSectionVisible$ = this.groupsPanelVisible.asObservable();
    get currentVisibilitygroupsPanel(): boolean {
      return this.groupsPanelVisible.value;
    }
    setGroupsPanelVisibility(visible: boolean): void {
      this.groupsPanelVisible.next(visible);
    }
    toggleGroupsPanel(): void {
      this.groupsPanelVisible.next(!this.groupsPanelVisible.value);
    }
  // =====================Sidemenu=================
    private readonly smallScreenQuery = '(max-width: 768px)';
    private isHeirarchyMenuSubject = new BehaviorSubject<boolean>(!this.isSmallScreen());
    isHeirarchyMenu$ = this.isHeirarchyMenuSubject.asObservable();
    toggleHierarchyMenu(): void {
      this.isHeirarchyMenuSubject.next(!this.isHeirarchyMenuSubject.value);
    }
    setHierarchyMenuState(isOpen: boolean): void {
      this.isHeirarchyMenuSubject.next(isOpen);
    }
    get currentHierarchyMenuState(): boolean {
      return this.isHeirarchyMenuSubject.value;
    }
    isSmallScreen(): boolean {
      return typeof window !== 'undefined' && window.matchMedia(this.smallScreenQuery).matches;
    }
  }