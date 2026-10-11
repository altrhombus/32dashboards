/**
 * Parses a money string as platforms display it ("$1,234.56", "1234",
 * "USD 50"). Unlike the schema package's lenient parseCurrencyValue, which
 * maps garbage to 0, this returns null, so a markup change can't silently
 * report a $0 total.
 */
export function parseMoney(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Parses a whole count ("3", "12 bids"); null if there's no number. */
export function parseCount(raw: string | null | undefined): number | null {
  const match = raw?.replace(/,/g, "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}
