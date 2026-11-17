import { Directive, HostBinding, HostListener } from '@angular/core';

@Directive({
  selector: '[appWholeRupee]',
  standalone: true
})
export class WholeRupeeDirective {
  @HostBinding('attr.inputmode')
  public readonly inputMode = 'numeric';

  private readonly navigationKeys = new Set([
    'Backspace',
    'Delete',
    'Tab',
    'Escape',
    'Enter',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End'
  ]);

  @HostListener('keydown', ['$event'])
  public onKeydown(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'preventDefault'>): void {
    if (
      event.ctrlKey ||
      event.metaKey ||
      this.navigationKeys.has(event.key) ||
      (event.key.length === 1 && /^\d$/.test(event.key))
    ) {
      return;
    }

    event.preventDefault();
  }

  @HostListener('beforeinput', ['$event'])
  public onBeforeInput(event: InputEvent): void {
    if (event.inputType.startsWith('delete') || (event.data !== null && /^\d+$/.test(event.data))) {
      return;
    }

    event.preventDefault();
  }

  @HostListener('paste', ['$event'])
  public onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!/^\d+$/.test(text)) event.preventDefault();
  }

  @HostListener('drop', ['$event'])
  public onDrop(event: DragEvent): void {
    event.preventDefault();
  }
}
