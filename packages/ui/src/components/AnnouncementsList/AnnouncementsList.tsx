import "./AnnouncementsList.css";

export interface AnnouncementsListProps {
  announcements: string[];
}

/**
 * Announcement text is rendered as plain JSX children (not
 * dangerouslySetInnerHTML), so React escapes it automatically -- this is
 * the fix for legacy main.js's unescaped innerHTML interpolation.
 */
export function AnnouncementsList({ announcements }: AnnouncementsListProps) {
  if (announcements.length === 0) {
    return null;
  }

  return (
    <ul className="announcements-list">
      {announcements.map((announcement, index) => (
        <li key={index} className="announcements-list__item">
          {announcement}
        </li>
      ))}
    </ul>
  );
}
