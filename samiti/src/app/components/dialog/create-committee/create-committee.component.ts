import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { HeaderService } from '../../../components/header/header.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';
import { CreateCommitteeService } from './create-committee.service';
import { MatToolbar } from '@angular/material/toolbar';
import { TextFormatService } from '../../../shared/services/text-format-service.service';
import { AuthService } from '../../../core/services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-create-committee-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatToolbar
  ],
  templateUrl: './create-committee.component.html',
  styleUrl: './create-committee.component.scss'
})
export class CreateCommitteeDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<CreateCommitteeDialogComponent>);
  private readonly createCommitteeService = inject(CreateCommitteeService);
  private readonly notifier = inject(NotifierService);
  private readonly headerService = inject(HeaderService);
  private readonly textFormatService = inject(TextFormatService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  
  public readonly injectedData = inject(MAT_DIALOG_DATA, { optional: true });

  // 📝 NgModel models bindings
  public committeeName: string = '';
  public establishYear: number = 2026;
  public addressLocation: string = '';
  public latitude: number | null = null;
  public longitude: number | null = null;
  public primaryContact: string = '';
  public secondaryContact: string = '';

  public isEditMode: boolean = false;
  private committeeIdForEdit: number | null = null;

  private static buildCreateResultPayload(response: any) {
    return {
      createdCommitteeId: Number(response?.id || 0),
      createdCommitteeName: String(response?.committeeName || ''),
      updated: false
    };
  }

  ngOnInit(): void {
    const committee = this.injectedData?.committee;

    if (committee?.committeeId) {
      this.isEditMode = true;
      this.committeeIdForEdit = Number(committee.committeeId);
      this.committeeName = committee.committeeName || '';
      this.establishYear = Number(committee.establishYear || 2026);
      this.addressLocation = committee.address || '';
      this.latitude = committee.latitude != null ? Number(committee.latitude) : null;
      this.longitude = committee.longitude != null ? Number(committee.longitude) : null;

      const contacts = Array.isArray(committee.contactNumbers) ? committee.contactNumbers : [];
      this.primaryContact = contacts[0] || '';
      this.secondaryContact = contacts[1] || '';
    } else {
      this.isEditMode = false;
      const gps = this.headerService.userLocationCords();
      if (gps) {
        this.latitude = gps.lat;
        this.longitude = gps.long;
      }
    }
  }

  get isFormValid(): boolean {
    return (
      !!this.committeeName?.trim() &&
      !!this.establishYear &&
      !!this.addressLocation?.trim() &&
      !!this.primaryContact?.trim()
    );
  }

  public onCancel(): void {
    this.dialogRef.close(false);
  }

  public async onSubmit(): Promise<void> {
    if (!this.isFormValid) return;

    const contactsArray: string[] = [this.primaryContact.trim()];
    if (this.secondaryContact?.trim()) {
      contactsArray.push(this.secondaryContact.trim());
    }

    const payload = {
      name: this.committeeName.trim(),
      establish_year: Number(this.establishYear),
      address: this.addressLocation.trim(),
      contact_numbers: contactsArray,
      latitude: Number(this.latitude),
      longitude: Number(this.longitude)
    };

    if (this.isEditMode && this.committeeIdForEdit) {
      this.executeGroupUpdate({
        ...payload,
        committeeId: this.committeeIdForEdit
      });
      return;
    }

    this.executeGroupCreation(payload);
  }

  private executeGroupCreation(payload: any): void {
    const existingDashboardTree = this.authService.getStoredUserData()?.dashboardTree || [];
    const shouldRouteToDashboardHome = existingDashboardTree.length === 0;

    this.createCommitteeService.createCommittee(payload).subscribe({
      next: (response) => {
        const rawUserName = this.authService.getStoredUserData()?.name || 'User';
        const displayUserName = this.textFormatService.toTitleCase(rawUserName);
        const displayGroupName = this.textFormatService.toTitleCase(payload?.name || this.committeeName);

        this.notifier.success(
          `Hi, **${displayUserName}**! You have successfully created the group **${displayGroupName}**.`,
          'Group Created'
        );

        // First-time group creation after login: bootstrap dashboard tree and route to dashboard/home once.
        if (shouldRouteToDashboardHome) {
          const createdCommitteeNode = {
            id: String(response?.id || ''),
            name: response?.committeeName || payload?.name || this.committeeName,
            type: 'committee',
            roles: ['COMMITTEE_ADMIN', 'COMMITTEE_MEMBER'],
            children: []
          };

          this.authService.updateStoredUserData({
            dashboardTree: response?.id ? [createdCommitteeNode] : existingDashboardTree
          });

          this.router.navigate(['/dashboard', 'home']);
        }

        this.dialogRef.close(CreateCommitteeDialogComponent.buildCreateResultPayload(response));
      },
      error: (err) => this.notifier.error(err?.message || 'Server network exception.')
    });
  }

  private executeGroupUpdate(payload: any): void {
    this.createCommitteeService.updateCommittee(payload).subscribe({
      next: (response) => {
        const rawUserName = this.authService.getStoredUserData()?.name || 'User';
        const displayUserName = this.textFormatService.toTitleCase(rawUserName);
        const displayGroupName = this.textFormatService.toTitleCase(payload?.name || this.committeeName);

        this.notifier.success(
          `Hi, **${displayUserName}**! You have successfully updated the group **${displayGroupName}**.`,
          'Group Updated'
        );
        this.dialogRef.close(true);
      },
      error: (err) => this.notifier.error(err?.message || 'Server network exception.')
    });
  }

}