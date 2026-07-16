import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { PromoteMemberDialogData, PromoteMemberDialogResponse } from './promote-member.models';
import { PromoteMemberDialogService } from './promote-member.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';

@Component({
  selector: 'app-promote-member-dialog',
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
  templateUrl: './promote-member.component.html',
  styleUrl: './promote-member.component.scss',
})
export class PromoteMemberDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<PromoteMemberDialogComponent, PromoteMemberDialogResponse>);
  readonly data: PromoteMemberDialogData = inject(MAT_DIALOG_DATA);
  private readonly promoteMemberService = inject(PromoteMemberDialogService);
  private readonly notifier = inject(NotifierService);

  isLoading = signal<boolean>(false);
  selectedRole = signal<string>('COMMITTEE_ADMIN');

  // Available roles for promotion
  availableRoles = [
    { value: 'COMMITTEE_ADMIN', label: 'Group Admin' },
  ];

  onCancel(): void {
    this.dialogRef.close({ confirmed: false });
  }

  onConfirm(): void {
    if (!this.selectedRole()) {
      this.notifier.error('Please select a role to promote to.');
      return;
    }

    this.isLoading.set(true);
    this.promoteMemberService
      .promoteMember(this.data.userId, this.data.committeeId, this.selectedRole())
      .subscribe({
        next: (response) => {
          this.isLoading.set(false);
          if (response) {
            this.notifier.success(
              `Member promoted to ${this.getRoleLabel(this.selectedRole())}!`
            );
            this.dialogRef.close({ confirmed: true });
          }
        },
        error: (err) => {
          this.isLoading.set(false);
          this.notifier.error(err?.error?.message || 'Failed to promote member. Please try again.');
        },
      });
  }

  getRoleLabel(roleValue: string): string {
    const role = this.availableRoles.find((r) => r.value === roleValue);
    return role ? role.label : roleValue;
  }
}
