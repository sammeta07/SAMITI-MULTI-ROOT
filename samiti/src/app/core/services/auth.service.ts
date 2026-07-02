import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public isLoggedIn = signal<boolean>(localStorage.getItem('is_logged_in') === 'true');

  public updateLoginState(status: boolean): void {
    this.isLoggedIn.set(status);
  }
}