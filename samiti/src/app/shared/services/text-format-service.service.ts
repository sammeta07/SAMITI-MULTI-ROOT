import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TextFormatService {
  normalizeText(value: unknown): string {
    return this.normalizeLowerTrim(value);
  }

  normalizeLowerTrim(value: unknown): string {
    return String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  normalizeEmail(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  }

  normalizeMobile(value: unknown): string {
    return String(value ?? '')
      .trim();
  }

  normalizeGender(value: unknown): string {
    return this.normalizeLowerTrim(value);
  }

  toTitleCase(value: unknown): string {
    return String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}