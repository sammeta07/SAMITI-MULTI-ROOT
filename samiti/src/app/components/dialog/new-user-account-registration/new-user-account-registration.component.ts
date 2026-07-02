import { Component, Injectable, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule, NgForm } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS, NativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { NewUserAccountRegistrationService } from './new-user-account-registration.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';
import { NewUserAccountRegistrationPayload, NewUserAccountRegistrationResponse } from './new-user-account-registration.models';
import { MatToolbar } from '@angular/material/toolbar';
import { firstValueFrom } from 'rxjs';
import { ImageAssetService } from '../../../core/services/image-asset.service';
import { ImageCropperDialogComponent } from '../../../shared/components/image-cropper-dialog/image-cropper-dialog.component';

const NEW_USER_ACCOUNT_REGISTRATION_DATE_FORMATS = {
  parse: {
    dateInput: 'dd-MM-yyyy'
  },
  display: {
    dateInput: 'dd/MMM/yyyy',
    monthYearLabel: 'MMM yyyy',
    dateA11yLabel: 'LL',
    monthYearA11yLabel: 'MMMM yyyy'
  }
};

@Injectable()
class NewUserAccountRegistrationDateAdapter extends NativeDateAdapter {
  override format(date: Date, displayFormat: unknown): string {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '';
    }

    if (displayFormat === NEW_USER_ACCOUNT_REGISTRATION_DATE_FORMATS.display.dateInput) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = this.getMonthNames('short')[date.getMonth()].toUpperCase();
      const year = String(date.getFullYear());
      return `${day}/${month}/${year}`;
    }

    return super.format(date, displayFormat as Object);
  }
}

@Component({
  selector: 'app-new-user-account-registration-dialog',
  standalone: true,
  providers: [
    {
      provide: DateAdapter,
      useClass: NewUserAccountRegistrationDateAdapter
    },
    {
      provide: MAT_DATE_FORMATS,
      useValue: NEW_USER_ACCOUNT_REGISTRATION_DATE_FORMATS
    }
  ],
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule,
    MatIconModule,
    MatRadioModule,
    MatDatepickerModule,
    MatToolbar
  ],
  templateUrl: './new-user-account-registration.component.html',
  styleUrl: './new-user-account-registration.component.scss'
})
export class NewUserAccountRegistrationDialogComponent {
  private static readonly emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  private static readonly mobilePattern = /^\d{10}$/;
  private static readonly passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
  private static readonly namePattern = /^[A-Za-z][-A-Za-z .']{1,79}$/;

  name = '';
  email = '';
  mobile = '';
  gender = 'male';
  dateOfBirth: Date | null = null;
  password = '';
  confirmPassword = '';
  hidePassword = true;
  hideConfirmPassword = true;
  isSubmitting = signal(false);
  selectedProfilePhoto = signal<File | null>(null);
  profilePhotoPreviewUrl = signal<string>('');
  readonly maxDate = new Date();

  private notifier = inject(NotifierService);
  private registerService = inject(NewUserAccountRegistrationService);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly dialog = inject(MatDialog);

  constructor(public dialogRef: MatDialogRef<NewUserAccountRegistrationDialogComponent>) { }

  onCancel(): void {
    this.dialogRef.close();
  }

  async onProfilePhotoSelected(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const selectedFile = inputElement.files?.[0] ?? null;
    inputElement.value = '';

    if (!selectedFile) {
      return;
    }

    const selectedOrCroppedFile = await this.openProfilePhotoCropDialog(selectedFile);
    if (!selectedOrCroppedFile) {
      return;
    }

    this.selectedProfilePhoto.set(selectedOrCroppedFile);

    const reader = new FileReader();
    reader.onload = () => {
      this.profilePhotoPreviewUrl.set(String(reader.result || ''));
    };
    reader.readAsDataURL(selectedOrCroppedFile);
  }

  removeProfilePhoto(): void {
    this.selectedProfilePhoto.set(null);
    this.profilePhotoPreviewUrl.set('');
  }

  private normalizeText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizeMobile(value: string): string {
    return value.trim();
  }

  get hasMobileInvalidCharacters(): boolean {
    return this.mobile.length > 0 && /[^0-9]/.test(this.mobile);
  }

  private normalizeGender(value: string): string {
    return value.trim().toLowerCase();
  }

  private isFutureDate(value: Date | null): boolean {
    if (!value) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const candidate = new Date(value);
    candidate.setHours(0, 0, 0, 0);

    return candidate > today;
  }

  private async uploadSelectedProfilePhoto(): Promise<string | null> {
    const selectedProfilePhoto = this.selectedProfilePhoto();
    if (!selectedProfilePhoto) {
      return null;
    }

    const uploadedProfilePhotoMetadata = await firstValueFrom(
      this.imageAssetService.uploadSingleImageForUserProfilePhoto(selectedProfilePhoto)
    );

    return uploadedProfilePhotoMetadata.publicAbsoluteUrl;
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

  private extractErrorMessage(error: unknown): string {
    const typedError = error as {
      message?: string;
      error?: {
        message?: string;
        error?: string;
        errors?: Array<{ message?: string }>;
      };
    };

    return (
      typedError?.error?.errors?.[0]?.message ||
      typedError?.error?.message ||
      typedError?.error?.error ||
      typedError?.message ||
      'Registration failed. Please try again.'
    );
  }

  private getFirstValidationMessage(registerForm: NgForm): string | null {
    const normalizedName = this.normalizeText(this.name);
    const normalizedEmail = this.normalizeEmail(this.email);
    const normalizedMobile = this.normalizeMobile(this.mobile);
    const normalizedPassword = this.password.trim();

    if (!normalizedName) {
      return 'Full Name is required.';
    }

    if (!NewUserAccountRegistrationDialogComponent.namePattern.test(normalizedName)) {
      return 'Full Name is invalid. Use letters only (no numbers).';
    }

    if (!NewUserAccountRegistrationDialogComponent.emailPattern.test(normalizedEmail)) {
      return 'Email is invalid. Please enter a valid email address.';
    }

    if (this.hasMobileInvalidCharacters) {
      return 'Mobile Number can contain digits only. Letters, spaces, and symbols are not allowed.';
    }

    if (!NewUserAccountRegistrationDialogComponent.mobilePattern.test(normalizedMobile)) {
      return 'Mobile Number is invalid. Enter exactly 10 digits.';
    }

    if (!this.gender?.trim()) {
      return 'Gender is required.';
    }

    if (!this.dateOfBirth) {
      return 'Date of Birth is required.';
    }

    if (this.isFutureDate(this.dateOfBirth)) {
      return 'Date of Birth cannot be in the future.';
    }

    if (!NewUserAccountRegistrationDialogComponent.passwordPattern.test(normalizedPassword)) {
      return 'Password is invalid. Use 8-64 characters with letters and numbers.';
    }

    if (!this.passwordsMatch) {
      return 'Confirm Password does not match Password.';
    }

    if (registerForm.invalid) {
      return 'Please correct the highlighted form fields.';
    }

    return null;
  }

  async onSubmit(registerForm: NgForm): Promise<void> {
    registerForm.form.markAllAsTouched();

    if (registerForm.invalid || !this.isPasswordValid || !this.passwordsMatch || this.isFutureDate(this.dateOfBirth)) {
      const validationMessage = this.getFirstValidationMessage(registerForm);
      if (validationMessage) {
        this.notifier.error(validationMessage, 'Validation Error');
      }
      return;
    }

    this.isSubmitting.set(true);

    const body: NewUserAccountRegistrationPayload = {
      name: this.normalizeText(this.name),
      email: this.normalizeEmail(this.email),
      mobile: this.normalizeMobile(this.mobile),
      gender: this.normalizeGender(this.gender),
      dateOfBirth: this.dateOfBirth ? this.dateOfBirth.toISOString().split('T')[0] : '',
      password: this.password.trim(),
      profilePhoto: null,
      fcmToken: localStorage.getItem('fcmToken')?.trim() || null,
      baseRole: 'AUTH_USER'
    };

    try {
      await firstValueFrom(this.registerService.validateRegistration(body));
      body.profilePhoto = await this.uploadSelectedProfilePhoto();

      const result: NewUserAccountRegistrationResponse = await firstValueFrom(this.registerService.register(body));
      const registeredUserName = this.normalizeText(result.name || body.name);
      this.notifier.success(
        `Hi, ${registeredUserName}! You have registered successfully. Please log in to continue.`,
        'Registration Complete'
      );
      this.dialogRef.close(true);
    } catch (error: unknown) {
      this.notifier.error(this.extractErrorMessage(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  get passwordsMatch(): boolean {
    return this.password.trim() === this.confirmPassword.trim();
  }

  get isNameValid(): boolean {
    return NewUserAccountRegistrationDialogComponent.namePattern.test(this.normalizeText(this.name));
  }

  get isPasswordValid(): boolean {
    return NewUserAccountRegistrationDialogComponent.passwordPattern.test(this.password.trim());
  }

  get isFormValid(): boolean {
    const normalizedName = this.normalizeText(this.name);
    const normalizedEmail = this.normalizeEmail(this.email);
    const normalizedMobile = this.normalizeMobile(this.mobile);
    const normalizedPassword = this.password.trim();

    return (
      NewUserAccountRegistrationDialogComponent.namePattern.test(normalizedName) &&
      NewUserAccountRegistrationDialogComponent.emailPattern.test(normalizedEmail) &&
      NewUserAccountRegistrationDialogComponent.mobilePattern.test(normalizedMobile) &&
      !!this.gender &&
      !!this.dateOfBirth &&
      !this.isFutureDate(this.dateOfBirth) &&
      NewUserAccountRegistrationDialogComponent.passwordPattern.test(normalizedPassword) &&
      normalizedPassword === this.confirmPassword.trim() &&
      this.passwordsMatch
    );
  }
}
