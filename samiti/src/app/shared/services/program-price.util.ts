export function formatProgramPriceValue(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2).replace(/\.?0+$/, '');
}

export function formatProgramPriceLabel(price: number | null | undefined): string {
  if (price === null || price === undefined) return '';
  if (price === 0) return 'FREE';
  return `Fee ₹${formatProgramPriceValue(price)}`;
}
