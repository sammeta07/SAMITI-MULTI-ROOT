import {
  Component,
  inject,
  ViewChild,
  signal,
  OnInit,
  OnDestroy,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import { DashboardHierarchyTreeComponent } from './components/dashboard-hierarchy-tree/dashboard-hierarchy-tree.component';
import { UiToggleService } from '../../shared/services/ui-toggle.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatSidenavModule,
    MatIconModule,
    MatTooltipModule,
    DashboardHierarchyTreeComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('sidenav') sidenav!: MatSidenav;

  readonly isHierarchyMenuOpen = signal<boolean>(false);

  /* ─── Sidenav drag-resize state ─── */
  private static readonly SIDENAV_DEFAULT_WIDTH = 360;
  private static readonly SIDENAV_MIN_WIDTH = 240;
  private static readonly SIDENAV_MAX_WIDTH = 560;
  private static readonly SIDENAV_KEYBOARD_STEP = 24;
  private static readonly SIDENAV_CONTENT_MIN_GUTTER = 320;

  readonly sidenavWidth = signal<number>(DashboardComponent.SIDENAV_DEFAULT_WIDTH);
  readonly isResizing = signal<boolean>(false);

  private menuSubscription?: Subscription;

  private readonly uiService = inject(UiToggleService);

  ngOnInit(): void {
    this.isHierarchyMenuOpen.set(this.uiService.currentHierarchyMenuState);

    this.menuSubscription = this.uiService.isHeirarchyMenu$.subscribe((isOpen) => {
      this.isHierarchyMenuOpen.set(isOpen);
      this.updateSidenavMode();
    });
  }

  ngAfterViewInit(): void {
    this.updateSidenavMode();
  }

  ngOnDestroy(): void {
    this.menuSubscription?.unsubscribe();
  }

  private updateSidenavMode(): void {
    const isOpen = this.isHierarchyMenuOpen();

    if (this.sidenav) {
      this.sidenav.mode = 'side';
      this.sidenav.opened = isOpen;
    }
  }

  public toggleSideMenu(): void {
    this.uiService.toggleHierarchyMenu();
  }

  public closeSideMenu(): void {
    this.uiService.setHierarchyMenuState(false);
  }

  /* ─── Sidenav drag-resize handlers ─── */

  public onSidenavResizeStart(event: MouseEvent): void {
    event.preventDefault();
    if (!this.isHierarchyMenuOpen()) return;

    const startX = event.clientX;
    const startWidth = this.sidenavWidth();

    this.isResizing.set(true);
    document.body.classList.add('resizing-col');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    let rafId: number | null = null;
    let latestClientX = startX;

    const onMove = (moveEvent: MouseEvent) => {
      latestClientX = moveEvent.clientX;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        this.sidenavWidth.set(this.clampSidenavWidth(startWidth + (latestClientX - startX)));
      });
    };

    const onUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      this.sidenavWidth.set(this.clampSidenavWidth(startWidth + (latestClientX - startX)));
      this.isResizing.set(false);
      document.body.classList.remove('resizing-col');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  public onSidenavResizeKeydown(event: KeyboardEvent): void {
    const step = DashboardComponent.SIDENAV_KEYBOARD_STEP;
    let nextWidth: number | null = null;

    switch (event.key) {
      case 'ArrowLeft':
        nextWidth = this.sidenavWidth() - step;
        break;
      case 'ArrowRight':
        nextWidth = this.sidenavWidth() + step;
        break;
      case 'Home':
        nextWidth = DashboardComponent.SIDENAV_MIN_WIDTH;
        break;
      case 'End':
        nextWidth = DashboardComponent.SIDENAV_MAX_WIDTH;
        break;
      case 'Enter':
        this.resetSidenavWidth();
        event.preventDefault();
        return;
      default:
        return;
    }

    event.preventDefault();
    this.sidenavWidth.set(this.clampSidenavWidth(nextWidth));
  }

  public resetSidenavWidth(): void {
    this.sidenavWidth.set(DashboardComponent.SIDENAV_DEFAULT_WIDTH);
  }

  private clampSidenavWidth(width: number): number {
    const viewportCap = window.innerWidth - DashboardComponent.SIDENAV_CONTENT_MIN_GUTTER;
    const maxWidth = Math.max(
      DashboardComponent.SIDENAV_MIN_WIDTH,
      Math.min(DashboardComponent.SIDENAV_MAX_WIDTH, viewportCap)
    );

    return Math.round(
      Math.min(Math.max(width, DashboardComponent.SIDENAV_MIN_WIDTH), maxWidth)
    );
  }
}
