import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UiToggleService {
  // Mobile par Groups Panel by default false (hidden) rahega
  private groupsPanelVisible = new BehaviorSubject<boolean>(false);
  
  // Components is observable ko subscribe karenge
  isCommitteesSectionVisible$ = this.groupsPanelVisible.asObservable();

  // Current value getter (if needed anywhere)
  get currentVisibility(): boolean {
    return this.groupsPanelVisible.value;
  }

  // Toggle function
  toggleGroupsPanel(): void {
    this.groupsPanelVisible.next(!this.groupsPanelVisible.value);
  }

  // Direct set karne ke liye method (optional)
  setGroupsPanelVisibility(visible: boolean): void {
    this.groupsPanelVisible.next(visible);
  }
}