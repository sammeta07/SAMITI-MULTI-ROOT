import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MyCommitteeDetailedItem } from './dashboard-committees.models';
import { MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-dashboard-committees',
  standalone: true,
  imports: [
    CommonModule, 
    MatIconModule, 
    MatTabsModule, 
    MatDialogModule // 🚀 Registered Dialog module context
  ],
  templateUrl: './dashboard-committees.html',
  styleUrl: './dashboard-committees.scss'
})
export class DashboardCommittees implements OnInit {
  readonly isLoading = signal<boolean>(false);
  readonly allMyCommittees = signal<MyCommitteeDetailedItem[]>([]);

  readonly adminCommittees = computed(() => {
    return this.allMyCommittees().filter(c => c.isAdminPrivilege === true);
  });

  readonly memberCommittees = computed(() => {
    return this.allMyCommittees().filter(c => c.isAdminPrivilege === false);
  });

  ngOnInit() {
    this.allMyCommittees.set([]);
    this.isLoading.set(false);
  }

  openAllAdminsDialog(committeeId: number, name: string) {
    console.log(`Trigger new dialog API stream pipeline for full Admins list on committee: ${committeeId}`);
  }

  openAllMembersDialog(committeeId: number, name: string) {
    console.log(`Trigger new dialog API stream pipeline for full Members list on committee: ${committeeId}`);
  }

}