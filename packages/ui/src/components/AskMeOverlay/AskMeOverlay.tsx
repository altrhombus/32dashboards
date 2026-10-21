import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { AskMeConfig } from "@32dashboards/schema";
import { formatAmount } from "../../display/format.js";
import { ConfettiBurst } from "../ConfettiBurst/ConfettiBurst.js";
import "./AskMeOverlay.css";

export interface AskMeOverlayProps {
  askMe: AskMeConfig;
  /** Shows the overlay regardless of `askMe.enabled`, e.g. when a scene selects it. */
  visible?: boolean;
}

const ALLOWED_TAGS = ["p", "strong", "em", "ul", "ol", "li", "br", "a", "h1", "h2", "h3", "blockquote", "code"];
const ASK_ME_DELTA_DISPLAY_MS = 3_000;

/**
 * Markdown + DOMPurify allow-list sanitization -- the one place legacy
 * main.js got this right, now as pinned npm deps instead of unpinned CDN
 * scripts with no SRI hash and no offline fallback.
 */
function renderMarkdown(message: string): string {
  const html = marked.parse(message, { async: false }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: ["href"] });
}

export function AskMeOverlay({ askMe, visible = askMe.enabled }: AskMeOverlayProps) {
  const [delta, setDelta] = useState<number | null>(null);
  const [burst, setBurst] = useState(false);
  const previousTotalRef = useRef(askMe.total);

  useEffect(() => {
    const diff = askMe.total - previousTotalRef.current;
    previousTotalRef.current = askMe.total;
    if (diff <= 0) return;

    setDelta(diff);
    setBurst(true);
    const timeout = setTimeout(() => {
      setDelta(null);
      setBurst(false);
    }, ASK_ME_DELTA_DISPLAY_MS);
    return () => clearTimeout(timeout);
  }, [askMe.total]);

  if (!visible) return null;

  return (
    <div className="ask-me-overlay">
      <ConfettiBurst active={burst} />
      <div className="ask-me-overlay__title">{askMe.title}</div>
      <div className="ask-me-overlay__message" dangerouslySetInnerHTML={{ __html: renderMarkdown(askMe.message) }} />
      <div className="ask-me-overlay__total-wrapper">
        <span className="ask-me-overlay__total-label">Ask Me Total</span>
        <span className="ask-me-overlay__total-amount num">{formatAmount(askMe.total)}</span>
      </div>
      {delta !== null && <div className="ask-me-overlay__delta">+{formatAmount(delta)}</div>}
    </div>
  );
}
