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
import { NotifierService } from '../../../shared/notifier/notifier.service';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatToolbar } from '@angular/material/toolbar';
import { ImageAssetService } from '../../../core/services/image-asset.service';
import { ImageCropperDialogComponent } from '../../../shared/components/image-cropper-dialog/image-cropper-dialog.component';
import { TextFormatPipe } from '../../../shared/pipe/text-format-pipe.pipe';
import { TextFormatService } from '../../../shared/services/text-format-service.service';

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

  private notifier = inject(NotifierService);
  private accountService = inject(AccountService);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly dialog = inject(MatDialog);
  private readonly textFormatService = inject(TextFormatService);

  constructor(
    public dialogRef: MatDialogRef<AccountDialogComponent>
  ) {}

  ngOnInit(): void {
    this.loadAccountFromLocalStorage();
    this.loadAccountFromServer();
  }

  private loadAccountFromLocalStorage(): void {
    const userData = localStorage.getItem('userData');
    if (userData) {
      try {
        const userdata = JSON.parse(userData);
        this.applyUserData(userdata);
      } catch (e) {
        console.error('Failed to parse userData from localStorage', e);
      }
    }
  }

  private loadAccountFromServer(): void {
    this.isLoading.set(true);
    this.accountService.getAccount().subscribe({
      next: (response) => {
        if (response) {
          const mergedUserData = {
            ...(this.getLocalUserData() || {}),
            name: response.name,
            email: response.email,
            mobile: response.mobile,
            photo: response.photo || ''
          };

          this.applyUserData(mergedUserData);
          localStorage.setItem('userData', JSON.stringify(mergedUserData));
        }
        this.isLoading.set(false);
      },
      error: () => {
        // Silent fallback to localStorage when account query fails.
        this.isLoading.set(false);
      }
    });
  }

  private getLocalUserData(): Record<string, any> | null {
    const localData = localStorage.getItem('userData');
    if (!localData) {
      return null;
    }

    try {
      return JSON.parse(localData);
    } catch {
      return null;
    }
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

    const isoMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const monthIndex = Number(isoMatch[2]) - 1;
      const day = Number(isoMatch[3]);

      if (monthIndex >= 0 && monthIndex < 12 && day > 0 && day <= 31) {
        return `${String(day).padStart(2, '0')}-${AccountDialogComponent.monthAbbreviations[monthIndex]}-${year}`;
      }
    }

    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) {
      return dateValue;
    }

    const day = String(parsedDate.getDate()).padStart(2, '0');
    const month = AccountDialogComponent.monthAbbreviations[parsedDate.getMonth()];
    const year = parsedDate.getFullYear();

    return `${day}-${month}-${year}`;
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

      localStorage.setItem('userData', JSON.stringify(updatedUserData));
      localStorage.setItem('name', updateResponse.name);
      localStorage.setItem('mobile', updateResponse.mobile);
      if (updateResponse.photo) {
        localStorage.setItem('photo', updateResponse.photo);
      }

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

          // Update localStorage
          localStorage.setItem('userData', JSON.stringify(updatedUserData));
          localStorage.setItem('name', response.name);
          localStorage.setItem('mobile', response.mobile);
          if (response.photo) {
            localStorage.setItem('photo', response.photo);
          }

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
