import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { HeaderService } from '../../../components/header/header.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';
import { CreateCommitteeService } from './create-committee.service';
import { MatToolbar } from '@angular/material/toolbar';
import { ImageAssetService } from '../../../core/services/image-asset.service';
import { ImageCropperDialogComponent } from '../../../shared/components/image-cropper-dialog/image-cropper-dialog.component';
import { TextFormatService } from '../../../shared/services/text-format-service.service';
import { AuthService } from '../../../core/services/auth.service';

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
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly dialog = inject(MatDialog);
  private readonly textFormatService = inject(TextFormatService);
  private readonly authService = inject(AuthService);
  
  public readonly injectedData = inject(MAT_DIALOG_DATA, { optional: true });

  // 📝 NgModel models bindings
  public committeeName: string = '';
  public establishYear: number = 2026;
  public addressLocation: string = '';
  public primaryContact: string = '';
  public secondaryContact: string = '';
  public description: string = '';
  public committeeLogoPreviewUrl: string | null = null;
  public selectedCommitteeLogoFile: File | null = null;
  public isUploadingCommitteeLogo: boolean = false;
  public existingCommitteeLogoUrl: string | null = null;

  public isEditMode: boolean = false;
  private committeeIdForEdit: number | null = null;

  ngOnInit(): void {
    const committee = this.injectedData?.committee;

    if (committee?.committeeId) {
      this.isEditMode = true;
      this.committeeIdForEdit = Number(committee.committeeId);
      this.committeeName = committee.committeeName || '';
      this.establishYear = Number(committee.establishYear || 2026);
      this.addressLocation = committee.address || '';
      this.description = committee.description || '';
      this.existingCommitteeLogoUrl = committee.logo || null;
      this.committeeLogoPreviewUrl = committee.logo || null;

      const contacts = Array.isArray(committee.contactNumbers) ? committee.contactNumbers : [];
      this.primaryContact = contacts[0] || '';
      this.secondaryContact = contacts[1] || '';
    } else {
      this.isEditMode = false;
    }
  }

  get isFormValid(): boolean {
    return (
      !!this.committeeName?.trim() &&
      !!this.establishYear &&
      !!this.addressLocation?.trim() &&
      !!this.primaryContact?.trim() &&
      !!this.description?.trim()
    );
  }

  public onCancel(): void {
    this.dialogRef.close(false);
  }

  public async onCommitteeLogoFileSelected(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const selectedFile = inputElement.files?.[0] || null;

    if (!selectedFile) {
      return;
    }

    const selectedOrCroppedFile = await firstValueFrom(
      this.dialog.open(ImageCropperDialogComponent, {
        width: 'min(92vw, 920px)',
        data: {
          file: selectedFile,
          title: 'Crop Committee Logo',
          maintainAspectRatio: true,
          aspectRatio: 1
        }
      }).afterClosed()
    );

    if (!selectedOrCroppedFile) {
      return;
    }

    this.selectedCommitteeLogoFile = selectedOrCroppedFile;

    const reader = new FileReader();
    reader.onload = () => {
      this.committeeLogoPreviewUrl = String(reader.result || '');
    };
    reader.readAsDataURL(selectedOrCroppedFile);
  }

  public clearCommitteeLogoSelection(): void {
    this.selectedCommitteeLogoFile = null;
    this.existingCommitteeLogoUrl = null;
    this.committeeLogoPreviewUrl = null;
  }

  public async onSubmit(): Promise<void> {
    if (!this.isFormValid) return;

    const coords = this.headerService.userLocationCords();
    const contactsArray: string[] = [this.primaryContact.trim()];
    if (this.secondaryContact?.trim()) {
      contactsArray.push(this.secondaryContact.trim());
    }

    let uploadedCommitteeLogoUrl: string | null = null;
    if (this.selectedCommitteeLogoFile) {
      try {
        this.isUploadingCommitteeLogo = true;
        const uploadedLogoMetadata = await firstValueFrom(
          this.imageAssetService.uploadSingleImageForCommitteeLogo(this.selectedCommitteeLogoFile)
        );
        uploadedCommitteeLogoUrl = uploadedLogoMetadata.publicAbsoluteUrl;
      } catch (uploadError: unknown) {
        const typedUploadError = uploadError as { message?: string };
        this.notifier.error(typedUploadError.message || 'Failed to upload committee logo.');
        this.isUploadingCommitteeLogo = false;
        return;
      }
      this.isUploadingCommitteeLogo = false;
    }

    const payload = {
      name: this.committeeName.trim(),
      establish_year: Number(this.establishYear),
      address: this.addressLocation.trim(),
      contact_numbers: contactsArray, // Dispatches clean mapped dynamic arrays back onto server database structures
      description: this.description.trim(),
      latitude: coords ? coords.lat : 21.2211103,
      longitude: coords ? coords.long : 81.4502262,
      logo: uploadedCommitteeLogoUrl || this.existingCommitteeLogoUrl || null
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
    this.createCommitteeService.createCommittee(payload).subscribe({
      next: (response) => {
        const rawUserName = this.authService.getStoredUserData()?.name || 'User';
        const displayUserName = this.textFormatService.toTitleCase(rawUserName);
        const displayGroupName = this.textFormatService.toTitleCase(payload?.name || this.committeeName);

        this.notifier.success(
          `Hi, **${displayUserName}**! You have successfully created the group **${displayGroupName}**.`,
          'Group Created'
        );
        this.dialogRef.close(true);
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