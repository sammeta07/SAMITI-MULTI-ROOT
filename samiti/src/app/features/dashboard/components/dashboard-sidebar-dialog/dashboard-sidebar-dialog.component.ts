import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DashboardHierarchyTreeComponent } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.component';

@Component({
  selector: 'app-dashboard-sidebar-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    DashboardHierarchyTreeComponent
  ],
  templateUrl: './dashboard-sidebar-dialog.component.html',
  styleUrl: './dashboard-sidebar-dialog.component.scss'
})
export class DashboardSidebarDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<DashboardSidebarDialogComponent>
  ) { }

  onClose(): void {
    this.dialogRef.close();
  }
}
