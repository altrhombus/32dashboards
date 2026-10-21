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
  // What's been added recently: quick taps add up ("+$200") instead of replacing each other.
  const [delta, setDelta] = useState<{ amount: number; key: number } | null>(null);
  const [burst, setBurst] = useState(false);
  const previousTotalRef = useRef(askMe.total);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const diff = askMe.total - previousTotalRef.current;
    previousTotalRef.current = askMe.total;
    if (diff <= 0) return;

    setDelta((current) => ({ amount: (current?.amount ?? 0) + diff, key: (current?.key ?? 0) + 1 }));
    setBurst(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDelta(null);
      setBurst(false);
    }, ASK_ME_DELTA_DISPLAY_MS);
  }, [askMe.total]);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!visible) return null;

  return (
    <div className="ask-me-overlay">
      <ConfettiBurst active={burst} />
      <div className="ask-me-overlay__title">{askMe.title}</div>
      <div className="ask-me-overlay__message" dangerouslySetInnerHTML={{ __html: renderMarkdown(askMe.message) }} />
      <div className="ask-me-overlay__total-wrapper">
        {/* A reserved line above the total, so the pop-up never covers it and the total doesn't move. */}
        <div className="ask-me-overlay__delta-slot" aria-live="polite">
          {delta && (
            <span key={delta.key} className="ask-me-overlay__delta num">
              +{formatAmount(delta.amount)}
            </span>
          )}
        </div>
        <span className="ask-me-overlay__total-label">Ask Me Total</span>
        <span className="ask-me-overlay__total-amount num">{formatAmount(askMe.total)}</span>
      </div>
    </div>
  );
}
