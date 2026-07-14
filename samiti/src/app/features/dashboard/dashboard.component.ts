import { Component, inject, ViewChild, ElementRef, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { DashboardHierarchyTreeComponent } from './components/dashboard-hierarchy-tree/dashboard-hierarchy-tree.component';
import { DashboardSidebarDialogComponent } from './components/dashboard-sidebar-dialog/dashboard-sidebar-dialog.component';
import { UiToggleService } from '../../shared/services/ui-toggle.service'
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatDialogModule,
    DashboardHierarchyTreeComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  @ViewChild('sidebarEl', { static: false }) sidebarElement!: ElementRef<HTMLElement>;
  private static readonly SIDEBAR_MIN_WIDTH = 200;
  private static readonly SIDEBAR_MAX_WIDTH = 560;

  readonly isSmallScreen = signal<boolean>(false);
  private readonly mediaQuery = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 768px)')
    : null;
  private sidebarDialogRef: MatDialogRef<DashboardSidebarDialogComponent> | null = null;
  private menuSubscription?: Subscription;

  private readonly dialog = inject(MatDialog);

  constructor(public uiService: UiToggleService) {}

  ngOnInit(): void {
    this.isSmallScreen.set(this.mediaQuery?.matches ?? false);
    this.mediaQuery?.addEventListener('change', this.onScreenSizeChange);

    this.menuSubscription = this.uiService.isHeirarchyMenu$.subscribe((isOpen) => {
      if (this.isSmallScreen()) {
        isOpen ? this.openSidebarDialog() : this.closeSidebarDialog();
      } else {
        this.closeSidebarDialog();
      }
    });
  }

  ngOnDestroy(): void {
    this.mediaQuery?.removeEventListener('change', this.onScreenSizeChange);
    this.menuSubscription?.unsubscribe();
    this.closeSidebarDialog();
  }

  private readonly onScreenSizeChange = (event: MediaQueryListEvent): void => {
    this.isSmallScreen.set(event.matches);

    if (event.matches) {
      this.uiService.currentHierarchyMenuState ? this.openSidebarDialog() : this.closeSidebarDialog();
    } else {
      this.closeSidebarDialog();
    }
  };

  private openSidebarDialog(): void {
    if (this.sidebarDialogRef) {
      return;
    }

    document.body.classList.add('dialog-open');
    this.sidebarDialogRef = this.dialog.open(DashboardSidebarDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '100%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog-left'
    });

    this.sidebarDialogRef.afterClosed().subscribe(() => {
      document.body.classList.remove('dialog-open');
      this.sidebarDialogRef = null;
      this.uiService.setHierarchyMenuState(false);
    });
  }

  private closeSidebarDialog(): void {
    const ref = this.sidebarDialogRef;
    this.sidebarDialogRef = null;
    ref?.close();
  }


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