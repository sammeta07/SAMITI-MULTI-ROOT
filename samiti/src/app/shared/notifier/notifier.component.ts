import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotifierService } from './notifier.service';

@Component({
  selector: 'app-notifier',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifier.component.html',
  styleUrl: './notifier.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class NotifierComponent {
  readonly notifier = inject(NotifierService);
  
  // Track karne ke liye ki kaunsa toast abhi paused hai (for CSS binding)
  readonly pausedTimers = new Set<string>();

  trackById(index: number, item: { id: string }): string {
    return item.id;
  }

  pauseTimer(id: string): void {
    this.notifier.pause(id);
    this.pausedTimers.add(id);
  }

  resumeTimer(id: string): void {
    this.notifier.resume(id);
    this.pausedTimers.delete(id);
  }

  async copyMessage(message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(message);
      this.notifier.info('Copied to clipboard!', 'Copied');
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = message;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }

  formatMessage(message: string): string {
    const escapedMessage = String(message ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escapedMessage.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
}