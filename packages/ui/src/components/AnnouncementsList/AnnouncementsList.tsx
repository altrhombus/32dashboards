import { useEffect, useState } from "react";
import { InlineMarkdown } from "../../display/markdown.js";
import "./AnnouncementsList.css";

export interface AnnouncementsListProps {
  announcements: string[];
  /**
   * Show one at a time, each for this long, with a soft transition (and dots
   * for how many there are). Without it, all are listed.
   */
  rotateMs?: number;
}

/** How long the outgoing announcement takes to leave (matches the CSS). */
export const ANNOUNCEMENT_LEAVE_MS = 400;

/**
 * Each announcement is one line of Markdown (**bold**, *italics*), sanitized
 * by renderInlineMarkdown, so typed text can't inject markup into the TV.
 */
export function AnnouncementsList({ announcements, rotateMs }: AnnouncementsListProps) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const rotating = Boolean(rotateMs) && announcements.length > 1;

  useEffect(() => {
    setIndex(0);
    setLeaving(false);
  }, [announcements.length]);

  useEffect(() => {
    if (!rotating || !rotateMs) return;
    let swap: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      setLeaving(true);
      swap = setTimeout(() => {
        setIndex((i) => (i + 1) % announcements.length);
        setLeaving(false);
      }, ANNOUNCEMENT_LEAVE_MS);
    }, rotateMs);
    return () => {
      clearInterval(interval);
      clearTimeout(swap);
    };
  }, [rotating, rotateMs, announcements.length]);

  if (announcements.length === 0) {
    return null;
  }

  if (rotating) {
    const current = index % announcements.length;
    return (
      <div className="announcements-list announcements-list--rotating">
        <div
          key={current}
          className={`announcements-list__item announcements-list__slide${leaving ? " announcements-list__slide--leaving" : ""}`}
        >
          <InlineMarkdown className="clamp-3" text={announcements[current]!} />
        </div>
        <div className="announcements-list__dots" aria-hidden="true">
          {announcements.map((_, i) => (
            <span key={i} data-on={i === current || undefined} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ul className="announcements-list">
      {announcements.map((announcement, index) => (
        <li key={index} className="announcements-list__item">
          <InlineMarkdown text={announcement} />
        </li>
      ))}
    </ul>
  );
}
