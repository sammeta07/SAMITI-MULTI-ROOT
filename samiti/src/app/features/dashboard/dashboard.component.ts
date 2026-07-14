import { Component, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { DashboardHierarchyTreeComponent } from './components/dashboard-hierarchy-tree/dashboard-hierarchy-tree.component';
import { UiToggleService } from '../../shared/services/ui-toggle.service'
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    DashboardHierarchyTreeComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  @ViewChild('sidebarEl', { static: false }) sidebarElement!: ElementRef<HTMLElement>;
  private static readonly SIDEBAR_MIN_WIDTH = 200;
  private static readonly SIDEBAR_MAX_WIDTH = 560;

  constructor(public uiService: UiToggleService) {}

  // 🎚️ RESIZER MOUSE DRAG DRIVER: Real-time calculation mechanics for sidebar width changes
  public initSidebarResize(mouseDownEvent: MouseEvent): void {
    mouseDownEvent.preventDefault();
    
    const startX = mouseDownEvent.clientX;
    const startWidth = this.sidebarElement.nativeElement.getBoundingClientRect().width;

    const doDrag = (moveEvent: MouseEvent) => {
      const currentWidth = startWidth + (moveEvent.clientX - startX);

      if (
        currentWidth >= DashboardComponent.SIDEBAR_MIN_WIDTH &&
        currentWidth <= DashboardComponent.SIDEBAR_MAX_WIDTH
      ) {
        this.sidebarElement.nativeElement.style.width = `${currentWidth}px`;
        this.sidebarElement.nativeElement.style.minWidth = `${currentWidth}px`;
        this.sidebarElement.nativeElement.style.maxWidth = `${currentWidth}px`;
      }
    };

    const stopDrag = () => {
      window.removeEventListener('mousemove', doDrag);
      window.removeEventListener('mouseup', stopDrag);
    };

    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);
  }
}