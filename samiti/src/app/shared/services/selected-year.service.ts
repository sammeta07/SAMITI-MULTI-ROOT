import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SelectedYearService {
  private readonly currentYear = new Date().getFullYear();
  public readonly selectedYear = signal<number>(this.currentYear);
}
