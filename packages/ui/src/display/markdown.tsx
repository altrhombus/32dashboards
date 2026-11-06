import DOMPurify from "dompurify";
import { marked } from "marked";

/*
 * Markdown typed in the dashboard, made safe for the TV: marked turns it into
 * HTML, then DOMPurify keeps only an allow-list of tags (no scripts, styles
 * or attributes beyond links), so nothing typed can break or hijack a screen.
 */

const BLOCK_TAGS = ["p", "strong", "em", "del", "ul", "ol", "li", "br", "a", "h1", "h2", "h3", "blockquote", "code"];
const INLINE_TAGS = ["strong", "em", "del", "code", "br"];

/** A whole message: paragraphs, lists, headings, **bold**, *italics*. */
export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: BLOCK_TAGS, ALLOWED_ATTR: ["href"] });
}

/** One line: **bold**, *italics*, ~~struck~~, `code`. */
export function renderInlineMarkdown(text: string): string {
  const html = marked.parseInline(text, { async: false }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: INLINE_TAGS, ALLOWED_ATTR: [] });
}

/** One line of Markdown as a span, e.g. an announcement. */
export function InlineMarkdown({ text, className }: { text: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(text) }} />;
}
