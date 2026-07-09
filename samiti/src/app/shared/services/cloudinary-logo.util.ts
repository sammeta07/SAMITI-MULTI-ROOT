const CLOUDINARY_LOGO_PREFIX = 'https://res.cloudinary.com/';

export function sanitizeCloudinaryLogoUrl(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  return normalized.startsWith(CLOUDINARY_LOGO_PREFIX) ? normalized : null;
}
