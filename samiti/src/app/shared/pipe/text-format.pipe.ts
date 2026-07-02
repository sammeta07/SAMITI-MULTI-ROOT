import { Pipe, PipeTransform } from '@angular/core';
import { TextFormatService } from '../services/text-format.service';

export type TextFormatMode = 'title' | 'lower' | 'email' | 'mobile' | 'gender';

@Pipe({
  name: 'textFormat',
  standalone: true,
  pure: true
})
export class TextFormatPipe implements PipeTransform {
  constructor(private readonly textFormatService: TextFormatService) {}

  transform(value: unknown, mode: TextFormatMode = 'title'): string {
    switch (mode) {
      case 'lower':
      case 'gender':
        return this.textFormatService.normalizeLowerTrim(value);
      case 'email':
        return this.textFormatService.normalizeEmail(value);
      case 'mobile':
        return this.textFormatService.normalizeMobile(value);
      case 'title':
      default:
        return this.textFormatService.toTitleCase(value);
    }
  }
}