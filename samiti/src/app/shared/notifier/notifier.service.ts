import { Injectable, signal, inject } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { NotifierMessage, NotifierType } from './notifier.models';
import { NotifierComponent } from './notifier.component';

@Injectable({ providedIn: 'root' })
export class NotifierService {
  readonly messages = signal<NotifierMessage[]>([]);
  private timers = new Map<string, number>();
  private remainingTimes = new Map<string, number>();
  private startTimes = new Map<string, number>();
  private readonly lastShownByKey = new Map<string, number>();
  private readonly dedupeWindowMs = 1200;
  
  private overlay = inject(Overlay);
  private overlayRef: OverlayRef | null = null;

  success(message: string, title = 'Success', timeoutMs = 3500): string {
    return this.push('success', message, title, timeoutMs);
  }

  error(message: string, title = 'Error', timeoutMs = 5000): string {
    return this.push('error', message, title, timeoutMs);
  }

  warn(message: string, title = 'Warning', timeoutMs = 4500): string {
    return this.push('warn', message, title, timeoutMs);
  }

  info(message: string, title = 'Info', timeoutMs = 3500): string {
    return this.push('info', message, title, timeoutMs);
  }

  remove(id: string): void {
    this.clearTimer(id);
    this.remainingTimes.delete(id);
    this.startTimes.delete(id);
    this.messages.update((list) => list.filter((item) => item.id !== id));
    
    if (this.messages().length === 0 && this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
  }

  clear(): void {
    this.timers.forEach((timerId) => window.clearTimeout(timerId));
    this.timers.clear();
    this.remainingTimes.clear();
    this.startTimes.clear();
    this.messages.set([]);
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
  }

  pause(id: string): void {
    const timerId = this.timers.get(id);
    const startTime = this.startTimes.get(id);
    const initialRemaining = this.remainingTimes.get(id);

    if (timerId && startTime !== undefined && initialRemaining !== undefined) {
      window.clearTimeout(timerId);
      this.timers.delete(id);
      
      const elapsed = Date.now() - startTime;
      const newRemaining = Math.max(0, initialRemaining - elapsed);
      this.remainingTimes.set(id, newRemaining);
    }
  }

  resume(id: string): void {
    const remaining = this.remainingTimes.get(id);
    if (remaining && remaining > 0) {
      this.startTimes.set(id, Date.now());
      const timerId = window.setTimeout(() => this.remove(id), remaining);
      this.timers.set(id, timerId);
    }
  }
  
  getRemainingTime(id: string): number {
    return this.remainingTimes.get(id) ?? 0;
  }
  
  setTimeout(id: string, timeoutMs: number): void {
    this.clearTimer(id);
    if (timeoutMs > 0) {
      this.remainingTimes.set(id, timeoutMs);
      this.startTimes.set(id, Date.now());
      const timerId = window.setTimeout(() => this.remove(id), timeoutMs);
      this.timers.set(id, timerId);
    }
  }

  private clearTimer(id: string): void {
    const timerId = this.timers.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      this.timers.delete(id);
    }
  }

  private push(
    type: NotifierType,
    message: string,
    title?: string,
    timeoutMs?: number
  ): string {
    const dedupeKey = this.getDedupeKey(type, message, title);
    const now = Date.now();
    const lastShownAt = this.lastShownByKey.get(dedupeKey);

    // Guard against duplicate toasts from interceptor + component error handlers.
    if (lastShownAt && now - lastShownAt < this.dedupeWindowMs) {
      return '';
    }

    this.lastShownByKey.set(dedupeKey, now);

    const id = this.generateId();
    const actualTimeout = timeoutMs ?? 3500;
    
    const item: NotifierMessage = {
      id,
      type,
      message,
      title,
      timeoutMs: actualTimeout,
      createdAt: Date.now(),
    };

    this.messages.update((list) => [...list, item]);

    if (!this.overlayRef) {
      this.overlayRef = this.overlay.create({
        hasBackdrop: false,
        scrollStrategy: this.overlay.scrollStrategies.noop(),
        positionStrategy: this.overlay.position().global(),
      });
      
      const portal = new ComponentPortal(NotifierComponent);
      this.overlayRef.attach(portal);
    }

    if (actualTimeout > 0) {
      this.remainingTimes.set(id, actualTimeout);
      this.startTimes.set(id, Date.now());
      const timerId = window.setTimeout(() => this.remove(id), actualTimeout);
      this.timers.set(id, timerId);
    }

    return id;
  }

  private generateId(): string {
    return `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private getDedupeKey(type: NotifierType, message: string, title?: string): string {
    const normalizedMessage = (message || '').trim().toLowerCase();
    const normalizedTitle = (title || '').trim().toLowerCase();
    return `${type}|${normalizedTitle}|${normalizedMessage}`;
  }
}