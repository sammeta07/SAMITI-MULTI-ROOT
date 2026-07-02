import { Component, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DashboardHierarchyTreeComponent } from './components/dashboard-hierarchy-tree/dashboard-hierarchy-tree.component';
import { CreateCommitteeDialogComponent } from '../../components/dialog/create-committee/create-committee.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    DashboardHierarchyTreeComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly dialog = inject(MatDialog);
  
  @ViewChild('sidebarEl', { static: false }) sidebarElement!: ElementRef<HTMLElement>;

  // 🚀 LAUNCH DRAWER: Opens the dynamic full height overlay slide-drawer from left trigger actions button
  public openCreateCommitteeFromSidebar(): void {
    document.body.classList.add('dialog-open');

    const dialogRef = this.dialog.open(CreateCommitteeDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog'
    });

    dialogRef.afterClosed().subscribe(() => {
      document.body.classList.remove('dialog-open');
      // Tree data will naturally update via underlying stream refresh policies if needed
    });
  }

  // 🎚️ RESIZER MOUSE DRAG DRIVER: Real-time calculation mechanics for sidebar width changes
  public initSidebarResize(mouseDownEvent: MouseEvent): void {
    mouseDownEvent.preventDefault();
    
    const startX = mouseDownEvent.clientX;
    const startWidth = this.sidebarElement.nativeElement.getBoundingClientRect().width;

    const doDrag = (moveEvent: MouseEvent) => {
      const currentWidth = startWidth + (moveEvent.clientX - startX);
      
      // Enforce rigid standard boundary locks (Min: 260px, Max: 480px)
      if (currentWidth >= 260 && currentWidth <= 480) {
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