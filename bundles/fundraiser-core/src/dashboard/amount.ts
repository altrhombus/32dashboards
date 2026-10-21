/** "$1,250.50" -> 1250.5, rounded to cents; null unless it's a positive amount. */
export function parseAmount(text: string): number | null {
  const value = Number(text.replace(/[$,\s]/g, ""));
  return text.trim() !== "" && Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}
