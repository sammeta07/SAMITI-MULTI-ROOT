import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingStateService {
  private readonly _count = signal(0);

  readonly isLoading = computed(() => this._count() > 0);

  begin(): void {
    this._count.update((n) => n + 1);
  }

  end(): void {
    this._count.update((n) => (n > 0 ? n - 1 : 0));
  }
}
