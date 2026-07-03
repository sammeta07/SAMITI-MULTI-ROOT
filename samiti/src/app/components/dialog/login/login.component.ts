import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Router } from '@angular/router';
import { LoginService } from './login.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';
import { MatToolbar } from '@angular/material/toolbar';
import { LoginResponse } from './login.models';

const REMEMBER_KEY = 'remember_login';

@Component({
  selector: 'app-login-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule,
    MatIconModule,
    MatCheckboxModule,
    MatToolbar
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginDialogComponent implements OnInit {
  email = '';
  password = '';
  hidePassword = true;
  rememberMe = false;
  isForgotPassword = false;
  resetEmail = '';
  resetEmailSent = false;

  private notifier = inject(NotifierService);
  private router = inject(Router);
  private authService = inject(AuthService); // Injecting core central signal auth manager
  private loginService = inject(LoginService);

  constructor(
    public dialogRef: MatDialogRef<LoginDialogComponent>
  ) { }

  ngOnInit(): void {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      try {
        const creds = JSON.parse(atob(saved));
        this.email = creds.email || '';
        this.password = creds.password || '';
        this.rememberMe = true;
      } catch (e) {
        localStorage.removeItem(REMEMBER_KEY);
      }
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.rememberMe) {
      const creds = btoa(JSON.stringify({ email: this.email, password: this.password }));
      localStorage.setItem(REMEMBER_KEY, creds);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }

    const body = {
      email: this.email.trim(),
      password: this.password.trim(),
    };

    // 🚀 Exact Match: Directly matches your favorite { data: LoginResponse } structure
    this.loginService.login(body).subscribe({
      next: (response: LoginResponse) => {
        if (!response?.token) {
          this.notifier.error('Invalid credentials. Please try again.');
          return;
        }

        const token = response.token;
        const u = response.user;
        const dashboardTree = response.dashboardTree || [];

        // Commit identities data to localStorage lifecycle keys
        localStorage.setItem('token', token);
        localStorage.setItem('is_logged_in', 'true');
        
        const userdata = {
          id: u.id,
          name: u.name,
          email: u.email,
          mobile: u.mobile,
          dateOfBirth: u.dateOfBirth,
          gender: u.gender,
          baseRole: u.baseRole,
          photo: u.profilePhoto,
          fcmToken: u.fcmToken,
          dashboardTree,
          committees: dashboardTree.filter((node: any) => node.type === 'COMMITTEE'),
          events: dashboardTree.filter((node: any) => node.type === 'EVENT')
        };
        localStorage.setItem('userData', JSON.stringify(userdata));

        // 🛠️ Trigger centralized reactive signal engine state update
        this.authService.updateLoginState(true);
        this.dialogRef.close(true);

        // 🛠️ Navigate seamlessly to dashboard
        this.router.navigate(['dashboard']);
      },
      error: (err) => {
        // Fastify / GraphQL errors evaluation mapping check
        const errMsg = err?.error?.errors?.[0]?.message || err?.message || 'Server connection lost.';
        this.notifier.error(errMsg);
      }
    });
  }

  onForgotPassword(): void {
    if (!this.resetEmail) return;
    console.log('Password reset requested for:', this.resetEmail);
    this.resetEmailSent = true;
  }

  isEmail(value: string): boolean {
    return !value || /[a-zA-Z@.]/.test(value);
  }
}