export function formatProgramPriceValue(price: number): string {
  return String(Math.round(price));
}

export function formatProgramPriceLabel(price: number | null | undefined): string {
  if (price === null || price === undefined) return '';
  if (price === 0) return 'FREE';
  return `Fee ₹${formatProgramPriceValue(price)}`;
}
