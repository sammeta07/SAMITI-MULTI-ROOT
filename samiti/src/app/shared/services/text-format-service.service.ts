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

  toSentenceCase(value: unknown): string {
    const normalized = String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
    return normalized.replace(/(^\s*[a-z])|([.!?]\s*[a-z])/g, (segment) => segment.toUpperCase());
  }

  toOrdinal(value: unknown): string {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value ?? '');
    const abs = Math.abs(Math.trunc(num));
    return `${num}${abs % 100 >= 11 && abs % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][abs % 10]}`;
  }
}