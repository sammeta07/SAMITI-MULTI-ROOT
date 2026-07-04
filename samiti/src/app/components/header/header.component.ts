import { Component, OnInit, signal, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { HeaderService } from './header.service';
import { LocationCoords } from './header.models';
import { NotifierService } from '../../shared/notifier/notifier.service';
import { NewUserAccountRegistrationDialogComponent } from '../dialog/new-user-account-registration/new-user-account-registration.component';
import { LoginDialogComponent } from '../dialog/login/login.component';
import { AccountDialogComponent } from '../dialog/account/account.component';
import { CreateCommitteeDialogComponent } from '../dialog/create-committee/create-committee.component';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';


@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
  ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  @ViewChild('pillInput') pillInput!: ElementRef<HTMLInputElement>;

  private readonly notifier = inject(NotifierService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private authService = inject(AuthService);

  locationName = signal<string>('Locating...');
  isLoading = signal<boolean>(true);
  isSearchFocused = signal<boolean>(false);
  hasSearchText = signal<boolean>(false);
  isLoggedIn = this.authService.isLoggedIn;
  userPhoto = signal<string>('');
  userInitials = signal<string>('');
  userName = signal<string>('');
  constructor(private headerService: HeaderService) { }

  private isOnDashboardRoute(): boolean {
    return this.router.url.startsWith('/dashboard');
  }

  private resolveDisplayPhotoUrl(url: string): string {
    if (!url || url.startsWith('data:image')) {
      return url;
    }

    const cacheKey = Date.now();
    return url.includes('?') ? `${url}&v=${cacheKey}` : `${url}?v=${cacheKey}`;
  }

  ngOnInit() {
    this.detectLocation();
    if (this.isLoggedIn()) {
      this.loadUserData();
    }
  }

  detectLocation() {
    this.isLoading.set(true);
    this.locationName.set('Locating...');

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const body: LocationCoords = {
            lat: position.coords.latitude,
            long: position.coords.longitude
          };
          this.headerService.userLocationCords.set(body);
          this.headerService.getUserLocation(body).subscribe({
            next: (data) => {
              const place = data.address?.state_district || 'Location';
              this.locationName.set(place);
              this.isLoading.set(false);
            },
            error: () => {
              this.locationName.set('Location unavailable');
              this.isLoading.set(false);
              this.notifier.error('Could not fetch location details.');
            }
          });
        },
        (error) => {
          console.error('Error getting location:', error);
          this.locationName.set('Location denied');
          this.isLoading.set(false);
          this.notifier.warn('Location permission denied.');
        }
      );
    } else {
      console.error('Geolocation is not supported by this browser.');
      this.locationName.set('Not supported');
      this.isLoading.set(false);
      this.notifier.info('Geolocation is not supported by this browser.');
    }
  }

  onSearchFocus() {
    this.isSearchFocused.set(true);
  }

  onSearchBlur() {
    this.isSearchFocused.set(false);
  }

  onSearchInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.hasSearchText.set(value.length > 0);
  }

  clearSearch() {
    if (this.pillInput?.nativeElement) {
      this.pillInput.nativeElement.value = '';
      this.hasSearchText.set(false);
      this.pillInput.nativeElement.focus();
    }
  }

  openRegisterDialog(): void {
    document.body.classList.add('dialog-open');
    this.dialog.open(NewUserAccountRegistrationDialogComponent, {
      position: {
        right: '0',
        top: '0'
      },
      height: '100%',
      width: '50%',
      // maxWidth: '500px',
      // minWidth: '320px',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog'
    }).afterClosed().subscribe(() => {
      document.body.classList.remove('dialog-open');
    });
  }

  openLoginDialog(): void {
    document.body.classList.add('dialog-open');
    this.dialog.open(LoginDialogComponent, {
      position: {
        right: '0',
        top: '0'
      },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog'
    }).afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (result === true) {
        this.loadUserData();
      }
    });
  }

  loadUserData(): void {
    const storedUserData = this.authService.getStoredUserData();
    const name = storedUserData?.name || '';

    if (name) {
      this.userName.set(name);
    }

    if (!storedUserData) {
      if (name) {
        const initials = name
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);
        this.userInitials.set(initials);
      }
      return;
    }

    const userdata = storedUserData;

    if (userdata.name) {
      this.userName.set(userdata.name);
    }

    if (userdata.photo) {
      this.userPhoto.set(this.resolveDisplayPhotoUrl(userdata.photo));
      this.userInitials.set('');
    } else if (userdata.name) {
      const initials = userdata.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      this.userInitials.set(initials);
      this.userPhoto.set('');
    }
  }

  openAccountDialog(): void {
    document.body.classList.add('dialog-open');
    this.dialog.open(AccountDialogComponent, {
      position: {
        right: '0',
        top: '0'
      },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog'
    }).afterClosed().subscribe(() => {
      document.body.classList.remove('dialog-open');
      this.loadUserData();
    });
  }

  openCreateCommitteeFromHeader(): void {
    document.body.classList.add('dialog-open');

    this.dialog.open(CreateCommitteeDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog'
    }).afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');

      const createdCommitteeId = Number(result?.createdCommitteeId || 0);
      if (createdCommitteeId > 0 && this.isOnDashboardRoute()) {
        this.router.navigate(['/dashboard', 'group', createdCommitteeId]);
      }
    });
  }

  logout(): void {
    this.authService.clearSession();
    this.userPhoto.set('');
    this.userInitials.set('');
    this.userName.set('');
    this.router.navigate(['/home']);
  }

}
