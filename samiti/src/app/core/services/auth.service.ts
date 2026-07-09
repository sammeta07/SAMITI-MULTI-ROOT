import { Injectable, signal } from '@angular/core';

export interface AuthDashboardTreeNode {
  id: string;
  name: string;
  type: string;
  roles: string[];
  children: AuthDashboardTreeNode[];
}

export interface AuthCommitteeRoleItem {
  committeeId: number;
  committeeName: string;
  committeeLogo: string | null;
  committeeRole: string;
  roleLabel: string;
}

export interface AuthEventRoleItem {
  eventId: number;
  eventName: string;
  committeeId: number;
  committeeName: string;
  committeeLogo: string | null;
  designation: string;
  membershipStatus: string;
  eventStatus: string | null;
  eventVisibility: string | null;
}

export interface AuthAccountRoles {
  committees: AuthCommitteeRoleItem[];
  events: AuthEventRoleItem[];
}

export interface AuthUserData {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  baseRole: string[];
  photo: string | null;
  fcmToken: string | null;
  dashboardTree: AuthDashboardTreeNode[];
  accountRoles?: AuthAccountRoles | null;
}

export interface AuthSessionPayload {
  token: string;
  userData: AuthUserData;
}

export interface RememberedLoginCredentials {
  email: string;
  password: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private static readonly TOKEN_KEY = 'token';
  private static readonly LOGGED_IN_KEY = 'is_logged_in';
  private static readonly USER_DATA_KEY = 'userData';
  private static readonly REMEMBER_KEY = 'remember_login';

  public isLoggedIn = signal<boolean>(this.readLoginStateFromStorage());

  private readLoginStateFromStorage(): boolean {
    const hasLoginFlag = localStorage.getItem(AuthService.LOGGED_IN_KEY) === 'true';
    const hasToken = Boolean(localStorage.getItem(AuthService.TOKEN_KEY));
    return hasLoginFlag && hasToken;
  }

  private writeUserData(userData: AuthUserData): void {
    localStorage.setItem(AuthService.USER_DATA_KEY, JSON.stringify(userData));
  }

  public startSession(payload: AuthSessionPayload): void {
    localStorage.setItem(AuthService.TOKEN_KEY, payload.token);
    localStorage.setItem(AuthService.LOGGED_IN_KEY, 'true');
    this.writeUserData(payload.userData);
    this.isLoggedIn.set(true);
  }

  public getStoredUserData(): AuthUserData | null {
    const rawUserData = localStorage.getItem(AuthService.USER_DATA_KEY);
    if (!rawUserData) {
      return null;
    }

    try {
      return JSON.parse(rawUserData) as AuthUserData;
    } catch {
      return null;
    }
  }

  public getToken(): string | null {
    return localStorage.getItem(AuthService.TOKEN_KEY);
  }

  public getRememberedLogin(): RememberedLoginCredentials | null {
    const encodedCredentials = localStorage.getItem(AuthService.REMEMBER_KEY);
    if (!encodedCredentials) {
      return null;
    }

    try {
      const parsedCredentials = JSON.parse(atob(encodedCredentials)) as Partial<RememberedLoginCredentials>;
      return {
        email: parsedCredentials.email || '',
        password: parsedCredentials.password || ''
      };
    } catch {
      localStorage.removeItem(AuthService.REMEMBER_KEY);
      return null;
    }
  }

  public saveRememberedLogin(credentials: RememberedLoginCredentials): void {
    const encodedCredentials = btoa(JSON.stringify(credentials));
    localStorage.setItem(AuthService.REMEMBER_KEY, encodedCredentials);
  }

  public clearRememberedLogin(): void {
    localStorage.removeItem(AuthService.REMEMBER_KEY);
  }

  public updateStoredUserData(partialUserData: Partial<AuthUserData>): AuthUserData | null {
    const currentUserData = this.getStoredUserData();
    if (!currentUserData) {
      return null;
    }

    const nextUserData: AuthUserData = {
      ...currentUserData,
      ...partialUserData
    };

    this.writeUserData(nextUserData);
    return nextUserData;
  }

  public clearSession(): void {
    localStorage.removeItem(AuthService.LOGGED_IN_KEY);
    localStorage.removeItem(AuthService.TOKEN_KEY);
    localStorage.removeItem(AuthService.USER_DATA_KEY);
    this.isLoggedIn.set(false);
  }

  public updateLoginState(status: boolean): void {
    this.isLoggedIn.set(status);
  }
}