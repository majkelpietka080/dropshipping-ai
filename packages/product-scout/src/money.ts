// Strip float noise (e.g. 4199.999999999999) before rounding to cents.
function toCents(value: number): number {
  return Number((value * 100).toFixed(6));
}

export function roundMoney(value: number): number {
  return Math.round(toCents(value)) / 100;
}

// Prices derived from a margin floor must never fall below the exact value,
// otherwise the rounded price no longer meets the margin it was computed for.
export function ceilMoney(value: number): number {
  return Math.ceil(toCents(value)) / 100;
}

export function roundPercent(value: number): number {
  return Number(value.toFixed(1));
}

export function isValidPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function isValidMarginPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 100;
}

export function priceForMargin(cost: number, marginPercent: number): number {
  return ceilMoney(cost / (1 - marginPercent / 100));
}

// Tolerates float noise so a price computed for exactly X% margin counts as X%.
export const MARGIN_EPSILON = 1e-9;
