/*
 * Web addresses in what operators type, e.g. a call to action like
 * "Bid at https://www.32auctions.com/SpringGala", so the TVs can offer a QR
 * code and show the address the short way.
 */

const LINK =
  /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|edu|gov|io|co|us)(?:\/[^\s)"']*)?/i;

/** Drops punctuation that ends a sentence rather than the address. */
const trimEnd = (link: string) => link.replace(/[.,;:!?]+$/, "");

/** The first web address in `text`, ready for a QR code, or null. */
export function firstLink(text: string): string | null {
  const found = LINK.exec(text);
  if (!found) return null;
  const link = trimEnd(found[0]);
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

/** `text` with its addresses in their short form: "https://www.32auctions.com/x" -> "32auctions.com/x". */
export function shortenLinks(text: string): string {
  return text.replace(/\bhttps?:\/\/(?:www\.)?/gi, "");
}
