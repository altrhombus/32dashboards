import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  /** The event's logo, shown above the title. */
  logoUrl?: string | null;
  /** A small line above the title, e.g. "Ask Me 2 of 3". */
  kicker?: string;
}

const ALLOWED_TAGS = ["p", "strong", "em", "ul", "ol", "li", "br", "a", "h1", "h2", "h3", "blockquote", "code"];
const ASK_ME_DELTA_DISPLAY_MS = 3_000;
/** At most this many pop-ups at once; the oldest goes first. */
const MAX_GIFTS = 5;

interface Gift {
  id: number;
  amount: number;
}

/**
 * Markdown + DOMPurify allow-list sanitization -- the one place legacy
 * main.js got this right, now as pinned npm deps instead of unpinned CDN
 * scripts with no SRI hash and no offline fallback.
 */
function renderMarkdown(message: string): string {
  const html = marked.parse(message, { async: false }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: ["href"] });
}

export function AskMeOverlay({ askMe, visible = askMe.enabled, logoUrl, kicker }: AskMeOverlayProps) {
  // Each amount added gets its own pop-up, never summed with the last; quick ones fan out side by side.
  const [gifts, setGifts] = useState<Gift[]>([]);
  const previousTotalRef = useRef(askMe.total);
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const diff = askMe.total - previousTotalRef.current;
    previousTotalRef.current = askMe.total;
    if (diff <= 0) return;

    const gift = { id: ++nextIdRef.current, amount: diff };
    setGifts((current) => [...current, gift].slice(-MAX_GIFTS));
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      setGifts((current) => current.filter((g) => g.id !== gift.id));
    }, ASK_ME_DELTA_DISPLAY_MS);
    timersRef.current.add(timer);
  }, [askMe.total]);
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const newest = gifts[gifts.length - 1];

  if (!visible) return null;

  return (
    <div className="ask-me-overlay">
      {/* key: every gift starts its own burst */}
      <ConfettiBurst key={newest?.id ?? 0} active={Boolean(newest)} />
      {logoUrl && <img className="ask-me-overlay__logo" src={logoUrl} alt="" />}
      {kicker && <div className="ask-me-overlay__kicker">{kicker}</div>}
      {/* key: a new round's title arrives with its own entrance */}
      <div key={askMe.title} className="ask-me-overlay__title">
        {askMe.title}
      </div>
      <div className="ask-me-overlay__message" dangerouslySetInnerHTML={{ __html: renderMarkdown(askMe.message) }} />
      <div className="ask-me-overlay__total-wrapper">
        {/* A reserved line above the total, so the pop-up never covers it and the total doesn't move. */}
        <div className="ask-me-overlay__delta-slot" aria-live="polite">
          {gifts.map((gift, i) => {
            // 0 for the newest; older ones step out to alternating sides.
            const age = gifts.length - 1 - i;
            return (
              <span
                key={gift.id}
                className="ask-me-overlay__gift"
                data-age={Math.min(age, 3)}
                style={{ "--side": gift.id % 2 ? 1 : -1, "--age": age } as CSSProperties}
              >
                <span className="ask-me-overlay__delta num">+{formatAmount(gift.amount)}</span>
              </span>
            );
          })}
        </div>
        <span className="ask-me-overlay__total-label">Ask Me Total</span>
        <span className="ask-me-overlay__total-amount num">{formatAmount(askMe.total)}</span>
      </div>
    </div>
  );
}
