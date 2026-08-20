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
    DashboardHierarchyTreeComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('sidenav') sidenav!: MatSidenav;

  readonly isHierarchyMenuOpen = signal<boolean>(false);

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
}