/*
 * Display rules for money on screen: whole dollars, never cents. Totals
 * round *down*, so the screen never claims more than was raised.
 */

const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** A fundraising total: "$12,345" for 12,345.99. */
export function formatTotal(value: number): string {
  return wholeDollars.format(Math.max(0, Math.floor(value)));
}

/** Any other amount (bids, targets, deltas), rounded: "$60" for 59.5. */
export function formatAmount(value: number): string {
  return wholeDollars.format(Math.round(value));
}
