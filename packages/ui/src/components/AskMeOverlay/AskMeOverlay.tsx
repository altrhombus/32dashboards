import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { AskMeConfig } from "@32dashboards/schema";
import { formatAmount } from "../../display/format.js";
import { renderMarkdown } from "../../display/markdown.js";
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

const ASK_ME_DELTA_DISPLAY_MS = 3_000;
/** At most this many pop-ups at once; the oldest goes first. */
const MAX_GIFTS = 5;

interface Gift {
  id: number;
  amount: number;
}

/** The smallest the message shrinks to (of its normal size) before it's allowed to be cut off. */
const MIN_FIT = 0.4;

/**
 * Shrinks the message's text until it fits the space left between the
 * title and the total, so a long appeal never pushes those off screen.
 * Refits when the text, the screen size, or the fonts change.
 */
function useFitText(box: RefObject<HTMLDivElement | null>, text: RefObject<HTMLDivElement | null>, content: string) {
  useLayoutEffect(() => {
    const outer = box.current;
    const inner = text.current;
    if (!outer || !inner) return;
    const fit = () => {
      let scale = 1;
      inner.style.setProperty("--ask-me-fit", "1");
      while (inner.scrollHeight > outer.clientHeight + 1 && scale > MIN_FIT) {
        scale = Math.round((scale - 0.05) * 100) / 100;
        inner.style.setProperty("--ask-me-fit", String(scale));
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    // Only the outer box: watching the text too would refit on our own changes.
    let width = outer.clientWidth;
    let height = outer.clientHeight;
    const observer = new ResizeObserver(() => {
      if (outer.clientWidth === width && outer.clientHeight === height) return;
      width = outer.clientWidth;
      height = outer.clientHeight;
      fit();
    });
    observer.observe(outer);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [box, text, content]);
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
  const messageBox = useRef<HTMLDivElement>(null);
  const messageText = useRef<HTMLDivElement>(null);
  useFitText(messageBox, messageText, `${askMe.title}\n${askMe.message}\n${visible}`);

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
      <div ref={messageBox} className="ask-me-overlay__message">
        <div
          ref={messageText}
          className="ask-me-overlay__message-text"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(askMe.message) }}
        />
      </div>
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
