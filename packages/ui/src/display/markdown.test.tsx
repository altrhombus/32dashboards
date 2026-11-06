import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnnouncementsList } from "../components/AnnouncementsList/AnnouncementsList.js";
import { renderInlineMarkdown, renderMarkdown } from "./markdown.js";

describe("markdown", () => {
  it("renders an announcement's bold and italics", () => {
    const { container } = render(<AnnouncementsList announcements={["Dessert at **8:00**, *don't miss it*"]} />);
    expect(container.querySelector("strong")?.textContent).toBe("8:00");
    expect(container.querySelector("em")?.textContent).toBe("don't miss it");
  });

  it("keeps a line a line: no paragraphs, lists, links or markup sneaking in", () => {
    const html = renderInlineMarkdown(
      '[click](javascript:alert(1)) <img src=x onerror=alert(1)> <b onclick="x">hi</b>',
    );
    expect(html).not.toMatch(/<(a|img|p|b)\b|onerror|onclick|javascript/i);
    expect(html).toContain("hi");
  });

  it("allows lists in a whole message, without scripts", () => {
    const html = renderMarkdown("- one\n- two\n\n<script>alert(1)</script>");
    expect(html).toContain("<li>one</li>");
    expect(html).not.toContain("script");
  });
});
