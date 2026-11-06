import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnnouncementsList } from "./AnnouncementsList.js";

describe("AnnouncementsList", () => {
  it("never turns typed HTML into markup (Markdown is sanitized)", () => {
    const malicious = 'Doors at 6 <img src="x" onerror="window.__xss = true">';
    render(<AnnouncementsList announcements={[malicious]} />);

    expect(screen.getByText(/Doors at 6/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined();
  });

  it("renders nothing when there are no announcements", () => {
    const { container } = render(<AnnouncementsList announcements={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
