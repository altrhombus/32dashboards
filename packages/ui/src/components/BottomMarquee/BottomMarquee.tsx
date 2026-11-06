import { useEffect, useRef } from "react";
import type { SourceItem } from "@32dashboards/schema/core";
import { formatAmount } from "../../display/format.js";
import { durations } from "../../tokens/tokens.js";
import "./BottomMarquee.css";

export interface BottomMarqueeProps {
  items: SourceItem[];
  speedPxPerFrame?: number;
  /** Fires each time the marquee completes one full lap -- drives incentive-machine's cycle mode. */
  onCycleComplete?: () => void;
  /**
   * Marquees with the same key pick up where the last one stopped, e.g. the
   * info bar's, which is unmounted while other segments show. Without one,
   * it starts at the first item.
   */
  resumeKey?: string;
}

/** Where each keyed marquee was, so the next one with that key resumes there. */
const resumePositions = new Map<string, number>();

/**
 * Seamless duplicate-content marquee. Uses ResizeObserver to measure the
 * real content width instead of relying on offsetWidth timing at animation
 * start -- legacy main.js's version could visibly jump if a webfont/image
 * reflowed content after the width was first read.
 */
export function BottomMarquee({
  items,
  speedPxPerFrame = durations.scrollerSpeedPxPerFrame,
  onCycleComplete,
  resumeKey,
}: BottomMarqueeProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(resumeKey ? (resumePositions.get(resumeKey) ?? 0) : 0);
  const contentWidthRef = useRef(0);
  const onCycleCompleteRef = useRef(onCycleComplete);
  onCycleCompleteRef.current = onCycleComplete;

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) contentWidthRef.current = entry.contentRect.width;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    let rafId: number;
    function tick() {
      positionRef.current -= speedPxPerFrame;
      if (contentWidthRef.current > 0 && Math.abs(positionRef.current) >= contentWidthRef.current) {
        positionRef.current += contentWidthRef.current;
        onCycleCompleteRef.current?.();
      }
      if (wrapperRef.current) {
        wrapperRef.current.style.transform = `translateX(${positionRef.current}px)`;
      }
      if (resumeKey) resumePositions.set(resumeKey, positionRef.current);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [speedPxPerFrame, resumeKey]);

  if (items.length === 0) {
    return <div className="bottom-marquee" />;
  }

  const renderItems = (suffix: string) =>
    items.map((item, i) => (
      <span className="bottom-marquee__item" key={`${suffix}-${i}`}>
        <strong>{item.title || "Untitled item"}</strong>
        {item.currentBid !== null && (
          <>
            {" "}
            — <span className="bottom-marquee__price num">{formatAmount(item.currentBid)}</span>
          </>
        )}
      </span>
    ));

  return (
    <div className="bottom-marquee">
      <div className="bottom-marquee__wrapper" ref={wrapperRef}>
        <div className="bottom-marquee__content" ref={contentRef}>
          {renderItems("a")}
        </div>
        <div className="bottom-marquee__content" aria-hidden="true">
          {renderItems("b")}
        </div>
      </div>
    </div>
  );
}
