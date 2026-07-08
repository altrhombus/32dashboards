import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnnouncementsList } from "./AnnouncementsList.js";

describe("AnnouncementsList", () => {
  it("renders announcement strings as literal text, not HTML", () => {
    const malicious = '<img src="x" onerror="window.__xss = true">';
    render(<AnnouncementsList announcements={[malicious]} />);

    // The literal markup text should appear on the page...
    expect(screen.getByText(malicious)).toBeInTheDocument();
    // ...but no actual <img> element should have been created from it.
    expect(document.querySelector("img")).toBeNull();
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined();
  });

  it("renders nothing when there are no announcements", () => {
    const { container } = render(<AnnouncementsList announcements={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
