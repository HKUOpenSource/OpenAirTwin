function normalizeZero(value: number, epsilon: number): number {
  return Math.abs(value) < epsilon ? 0 : value;
}

export function formatCompactNumber(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return "";
  const safeDigits = Math.max(0, Math.min(8, Math.trunc(maxDecimals)));
  const normalized = normalizeZero(value, 0.5 * 10 ** -safeDigits);
  return Number(normalized.toFixed(safeDigits)).toString();
}

export function formatFixed(value: number, digits = 1): string {
  return formatCompactNumber(value, digits);
}

export function formatFixed1(value: number): string {
  return formatCompactNumber(value, 1);
}

export function formatFixed2(value: number): string {
  return formatCompactNumber(value, 2);
}

export function formatFixed3(value: number): string {
  return formatCompactNumber(value, 3);
}

export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return "";
  const normalized = normalizeZero(value, 0.5);
  return String(Math.round(normalized));
}
