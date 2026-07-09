import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { AccountService } from './account.service';
import { MatTabsModule } from '@angular/material/tabs';
import { NotifierService } from '../../../shared/notifier/notifier.service';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatToolbar } from '@angular/material/toolbar';
import { ImageAssetService } from '../../../core/services/image-asset.service';
import { ImageCropperDialogComponent } from '../../../shared/components/image-cropper-dialog/image-cropper-dialog.component';
import { TextFormatPipe } from '../../../shared/pipe/text-format-pipe.pipe';
import { TextFormatService } from '../../../shared/services/text-format-service.service';
import { AuthAccountRoles, AuthService, AuthUserData } from '../../../core/services/auth.service';
import { MyAccountCommitteeRoleItem, MyAccountEventRoleItem } from './account.models';

@Component({
  selector: 'app-account-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule,
    MatIconModule,
    MatTooltipModule,
    MatTabsModule,
    MatToolbar,
    MatProgressSpinner,
    TextFormatPipe
    
  ],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss'
})
export class AccountDialogComponent implements OnInit {
  private static readonly monthAbbreviations = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  name = '';
  email = '';
  mobile = '';
  dateOfBirth = '';
  gender = '';
  photoUrl = signal<string>('');
  isPhotoImage = signal<boolean>(false);
  selectedProfilePhotoFile = signal<File | null>(null);
  isUploadingProfilePhoto = signal<boolean>(false);
  isEditMode = false;
  isLoading = signal<boolean>(false);
  selectedTabIndex = signal<number>(0);
  committeeRoles = signal<MyAccountCommitteeRoleItem[]>([]);
  eventRoles = signal<MyAccountEventRoleItem[]>([]);
  isRolesLoading = signal<boolean>(false);

  private notifier = inject(NotifierService);
  private accountService = inject(AccountService);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly dialog = inject(MatDialog);
  private readonly textFormatService = inject(TextFormatService);
  private readonly authService = inject(AuthService);

  constructor(
    public dialogRef: MatDialogRef<AccountDialogComponent>
  ) {}

  ngOnInit(): void {
    this.loadAccountFromLocalStorage();
    this.loadRolesFromLocalStorage();
  }

  private loadAccountFromLocalStorage(): void {
    const userData = this.authService.getStoredUserData();
    if (userData) {
      this.applyUserData(userData);
    }
  }

  private loadRolesFromLocalStorage(): void {
    const userData = this.authService.getStoredUserData();
    const cachedRoles = userData?.accountRoles;

    if (cachedRoles) {
      this.applyRoles(cachedRoles);
    }
  }

  private applyRoles(roles: AuthAccountRoles): void {
    this.isRolesLoading.set(false);
    this.committeeRoles.set(roles.committees || []);
    this.eventRoles.set(roles.events || []);
  }

  private getLocalUserData(): AuthUserData | null {
    return this.authService.getStoredUserData();
  }

  private applyUserData(userdata: any): void {
    this.name = userdata.name || '';
    this.email = userdata.email || '';
    this.mobile = userdata.mobile || '';
    this.dateOfBirth = this.formatDateOfBirth(userdata.dateOfBirth || '');
    this.gender = userdata.gender || '';

    if (userdata.photo) {
      const isImage = userdata.photo.startsWith('http') || userdata.photo.startsWith('data:image');
      this.photoUrl.set(this.resolveDisplayPhotoUrl(userdata.photo));
      this.isPhotoImage.set(isImage);
    } else {
      this.generateInitials();
    }
  }

  private formatDateOfBirth(dateValue: string): string {
    if (!dateValue) {
      return '';
    }

    const trimmedDateValue = String(dateValue).trim();

    if (/^\d{10,13}$/.test(trimmedDateValue)) {
      const numericValue = Number(trimmedDateValue);
      const normalizedTimestamp = trimmedDateValue.length === 10 ? numericValue * 1000 : numericValue;
      const timestampDate = new Date(normalizedTimestamp);

      if (!Number.isNaN(timestampDate.getTime())) {
        const day = String(timestampDate.getDate()).padStart(2, '0');
        const month = AccountDialogComponent.monthAbbreviations[timestampDate.getMonth()];
        const year = timestampDate.getFullYear();

        return `${day} ${month} ${year}`;
      }
    }

    const isoMatch = trimmedDateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const monthIndex = Number(isoMatch[2]) - 1;
      const day = Number(isoMatch[3]);

      if (monthIndex >= 0 && monthIndex < 12 && day > 0 && day <= 31) {
        return `${String(day).padStart(2, '0')} ${AccountDialogComponent.monthAbbreviations[monthIndex]} ${year}`;
      }
    }

    const parsedDate = new Date(trimmedDateValue);
    if (Number.isNaN(parsedDate.getTime())) {
      return trimmedDateValue;
    }

    const day = String(parsedDate.getDate()).padStart(2, '0');
    const month = AccountDialogComponent.monthAbbreviations[parsedDate.getMonth()];
    const year = parsedDate.getFullYear();

    return `${day} ${month} ${year}`;
  }

  private toTitleCase(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  get displayName(): string {
    return this.name ? this.textFormatService.toTitleCase(this.name) : '';
  }

  get displayGender(): string {
    return this.gender ? this.textFormatService.toTitleCase(this.gender) : '';
  }

  private resolveDisplayPhotoUrl(url: string): string {
    if (!url || url.startsWith('data:image')) {
      return url;
    }

    const cacheKey = Date.now();
    return url.includes('?') ? `${url}&v=${cacheKey}` : `${url}?v=${cacheKey}`;
  }

  generateInitials(): void {
    if (this.name) {
      const initials = this.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      this.photoUrl.set(initials);
      this.isPhotoImage.set(false);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  toggleEditMode(): void {
    this.isEditMode = !this.isEditMode;
    if (!this.isEditMode) {
      this.selectedProfilePhotoFile.set(null);
    }
  }

  onTabChanged(index: number): void {
    this.selectedTabIndex.set(index);
    if (index !== 0 && this.isEditMode) {
      this.isEditMode = false;
      this.selectedProfilePhotoFile.set(null);
    }
  }

  async onProfilePhotoSelected(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const selectedFile = inputElement.files?.[0] || null;
    inputElement.value = '';

    if (!selectedFile) {
      return;
    }

    const selectedOrCroppedFile = await this.openProfilePhotoCropDialog(selectedFile);

    if (!selectedOrCroppedFile) {
      return;
    }

    this.selectedProfilePhotoFile.set(selectedOrCroppedFile);

    const reader = new FileReader();
    reader.onload = () => {
      const previewDataUrl = String(reader.result || '');
      this.photoUrl.set(previewDataUrl);
      this.isPhotoImage.set(true);
    };
    reader.readAsDataURL(selectedOrCroppedFile);
  }

  async onAvatarPhotoSelected(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const selectedFile = inputElement.files?.[0] || null;
    inputElement.value = '';

    if (!selectedFile) {
      return;
    }

    if (!this.name?.trim() || !this.mobile?.trim()) {
      this.notifier.error('Name and mobile are required before updating profile photo.');
      return;
    }

    const selectedOrCroppedFile = await this.openProfilePhotoCropDialog(selectedFile);
    if (!selectedOrCroppedFile) {
      return;
    }

    this.isLoading.set(true);
    this.isUploadingProfilePhoto.set(true);

    try {
      const uploadedProfilePhotoMetadata = await firstValueFrom(
        this.imageAssetService.uploadSingleImageForUserProfilePhoto(selectedOrCroppedFile)
      );

      const updateResponse = await firstValueFrom(
        this.accountService.updateAccount({
          name: this.textFormatService.normalizeText(this.name),
          mobile: this.textFormatService.normalizeMobile(this.mobile),
          photo: uploadedProfilePhotoMetadata.publicAbsoluteUrl
        })
      );

      if (!updateResponse) {
        throw new Error('Failed to update profile photo');
      }

      const existingData = this.getLocalUserData() || {};
      const updatedUserData = {
        ...existingData,
        name: updateResponse.name,
        email: updateResponse.email,
        mobile: updateResponse.mobile,
        photo: updateResponse.photo || ''
      };

      this.authService.updateStoredUserData(updatedUserData);

      this.applyUserData(updatedUserData);
      this.selectedProfilePhotoFile.set(null);
      const displayUserName = this.textFormatService.toTitleCase(updateResponse.name || this.name || 'User');
      this.notifier.success(
        `Hi, **${displayUserName}**! You have successfully updated your profile photo.`,
        'Profile Updated'
      );
    } catch (error: any) {
      this.notifier.error(error?.message || 'Failed to update profile photo.');
    } finally {
      this.isUploadingProfilePhoto.set(false);
      this.isLoading.set(false);
    }
  }

  get committeeRoleCount(): number {
    return this.committeeRoles().length;
  }

  get eventRoleCount(): number {
    return this.eventRoles().length;
  }

  get hasRoles(): boolean {
    return this.committeeRoleCount > 0 || this.eventRoleCount > 0;
  }

  getRoleBadgeClass(role: string): string {
    const normalizedRole = String(role || '').toUpperCase();

    if (normalizedRole.includes('MASTER_ADMIN')) {
      return 'role-badge role-badge-master';
    }

    if (normalizedRole.includes('ADMIN')) {
      return 'role-badge role-badge-admin';
    }

    if (normalizedRole.includes('MEMBER')) {
      return 'role-badge role-badge-member';
    }

    return 'role-badge role-badge-auth';
  }

  getRoleLabel(role: string): string {
    return String(role || 'Member')
      .replace(/^COMMITTEE_/, '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private async openProfilePhotoCropDialog(file: File): Promise<File | null> {
    return firstValueFrom(
      this.dialog.open(ImageCropperDialogComponent, {
        width: 'min(92vw, 920px)',
        data: {
          file,
          title: 'Crop Profile Photo',
          maintainAspectRatio: true,
          aspectRatio: 1
        }
      }).afterClosed()
    );
  }

  async onSave(): Promise<void> {
    this.isLoading.set(true);

    let uploadedProfilePhotoUrl: string | undefined;
    const selectedProfilePhoto = this.selectedProfilePhotoFile();

    if (selectedProfilePhoto) {
      try {
        this.isUploadingProfilePhoto.set(true);
        const uploadedProfilePhotoMetadata = await firstValueFrom(
          this.imageAssetService.uploadSingleImageForUserProfilePhoto(selectedProfilePhoto)
        );
        uploadedProfilePhotoUrl = uploadedProfilePhotoMetadata.publicAbsoluteUrl;
      } catch (uploadError: unknown) {
        const typedUploadError = uploadError as { message?: string };
        this.notifier.error(typedUploadError.message || 'Failed to upload profile photo.');
        this.isUploadingProfilePhoto.set(false);
        this.isLoading.set(false);
        return;
      }
      this.isUploadingProfilePhoto.set(false);
    }

    this.accountService.updateAccount({
      name: this.textFormatService.normalizeText(this.name),
      mobile: this.textFormatService.normalizeMobile(this.mobile),
      photo: uploadedProfilePhotoUrl
    }).subscribe({
      next: (response) => {
        if (response) {
          const existingData = this.getLocalUserData() || {};
          const updatedUserData = {
            ...existingData,
            name: response.name,
            email: response.email,
            mobile: response.mobile,
            photo: response.photo || ''
          };

          this.authService.updateStoredUserData(updatedUserData);

          this.applyUserData(updatedUserData);
          const displayUserName = this.textFormatService.toTitleCase(response.name || this.name || 'User');
          this.notifier.success(
            `Hi, **${displayUserName}**! Your account details have been updated successfully.`,
            'Account Updated'
          );
          this.isEditMode = false;
          this.selectedProfilePhotoFile.set(null);
        } else {
          this.notifier.error('Failed to update account.');
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        this.notifier.error(err?.message || 'Failed to update account. Please try again.');
        this.isLoading.set(false);
      }
    });
  }
}
