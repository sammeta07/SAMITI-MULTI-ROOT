const CLOUDINARY_LOGO_PREFIX = 'https://res.cloudinary.com/';

export function sanitizeCloudinaryLogoUrl(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith(CLOUDINARY_LOGO_PREFIX)) {
    return normalized;
  }

  if (normalized.startsWith('http://res.cloudinary.com/')) {
    return normalized.replace(/^http:\/\//, 'https://');
  }

  if (normalized.startsWith('https://cdn.cloudinary.com/')) {
    return normalized.replace('https://cdn.cloudinary.com/', CLOUDINARY_LOGO_PREFIX);
  }

  if (normalized.startsWith('http://cdn.cloudinary.com/')) {
    return normalized.replace(/^http:\/\//, 'https://').replace('cdn.cloudinary.com/', 'res.cloudinary.com/');
  }

  return null;
}
