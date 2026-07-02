import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { DemoteMemberDialogData, DemoteMemberDialogResponse } from './demote-member.models';
import { DemoteMemberDialogService } from './demote-member.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';

@Component({
  selector: 'app-demote-member-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    FormsModule,
  ],
  templateUrl: './demote-member.component.html',
  styleUrl: './demote-member.component.scss',
})
export class DemoteMemberDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<DemoteMemberDialogComponent, DemoteMemberDialogResponse>);
  readonly data: DemoteMemberDialogData = inject(MAT_DIALOG_DATA);
  private readonly demoteMemberService = inject(DemoteMemberDialogService);
  private readonly notifier = inject(NotifierService);

  isLoading = signal<boolean>(false);
  selectedRole = signal<string>('');

  // Available roles for demotion
  availableRoles = [
    { value: 'member', label: 'Member' },
    { value: 'secretary', label: 'Secretary' },
    { value: 'treasurer', label: 'Treasurer' },
  ];

  onCancel(): void {
    this.dialogRef.close({ confirmed: false });
  }

  onConfirm(): void {
    if (!this.selectedRole()) {
      this.notifier.error('Please select a role to demote to.');
      return;
    }

    this.isLoading.set(true);
    this.demoteMemberService
      .demoteMember(this.data.userId, this.data.committeeId, this.selectedRole())
      .subscribe({
        next: (response) => {
          this.isLoading.set(false);
          if (response) {
            this.notifier.success(
              `Member demoted to ${this.getRoleLabel(this.selectedRole())}!`
            );
            this.dialogRef.close({ confirmed: true });
          }
        },
        error: (err) => {
          this.isLoading.set(false);
          this.notifier.error(err?.message || 'Failed to demote member. Please try again.');
        },
      });
  }

  getRoleLabel(roleValue: string): string {
    const role = this.availableRoles.find((r) => r.value === roleValue);
    return role ? role.label : roleValue;
  }
}
