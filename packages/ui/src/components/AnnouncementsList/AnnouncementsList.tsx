import { InlineMarkdown } from "../../display/markdown.js";
import "./AnnouncementsList.css";

export interface AnnouncementsListProps {
  announcements: string[];
}

/**
 * Each announcement is one line of Markdown (**bold**, *italics*), sanitized
 * by renderInlineMarkdown, so typed text can't inject markup into the TV.
 */
export function AnnouncementsList({ announcements }: AnnouncementsListProps) {
  if (announcements.length === 0) {
    return null;
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
