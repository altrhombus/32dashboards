/**
 * The single canonical currency parser/formatter for the whole system.
 * Legacy main.js had three independent reimplementations of this
 * (parseCurrencyValue, the regex in animateTotal, and an inline block in
 * updateBoard's celebration branch) -- this replaces all three.
 */
export function parseCurrencyValue(raw: string | null | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}
