import {
  MAX_ANNOUNCEMENTS,
  MAX_ANNOUNCEMENT_LENGTH,
  MILESTONE_STYLES,
  parseAnnouncements,
  type MilestoneStyle,
} from "@32dashboards/schema/core";

const MILESTONE_STYLE_NAMES: Record<MilestoneStyle, string> = {
  spotlight: "Fill the screen",
  infoBar: "In the info bar",
  named: "In the info bar; fill the screen for ones with a label",
};

/** How the TVs celebrate milestones, the same wherever it's set. Saves straight away. */
export function MilestoneStyleField(props: { value: MilestoneStyle; onChange: (style: MilestoneStyle) => void }) {
  return (
    <label className="field">
      <span>How the TVs celebrate</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value as MilestoneStyle)}>
        {MILESTONE_STYLES.map((style) => (
          <option key={style} value={style}>
            {MILESTONE_STYLE_NAMES[style]}
          </option>
        ))}
      </select>
      <span className="muted">
        The info bar keeps items and QR codes on screen. Goals count as labeled, and last calls always fill the screen.
      </span>
    </label>
  );
}

/** What's wrong with one-per-line announcements, in words, before they're saved. */
export function announcementsProblem(text: string): string | null {
  const lines = parseAnnouncements(text);
  const long = lines.findIndex((line) => line.length > MAX_ANNOUNCEMENT_LENGTH);
  if (long !== -1) return `Line ${long + 1} is over ${MAX_ANNOUNCEMENT_LENGTH} characters, so it can't be saved.`;
  if (lines.length > MAX_ANNOUNCEMENTS) return `That's over ${MAX_ANNOUNCEMENTS} lines, so it can't be saved.`;
  return null;
}

/** The event's announcements, the same wherever they're edited. */
export function AnnouncementsField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const problem = announcementsProblem(value);
  return (
    <label className="field">
      <span>Announcements, one per line (**bold** and *italics* work)</span>
      <textarea
        rows={4}
        placeholder={"Dessert auction opens at 8:00\nThank you to our volunteers"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {problem && <span className="warning">{problem}</span>}
    </label>
  );
}
