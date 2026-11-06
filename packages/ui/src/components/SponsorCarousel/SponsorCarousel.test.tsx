import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SPONSOR_LEAVE_MS, SponsorCarousel } from "./SponsorCarousel.js";

const sponsor = (n: number, logoUrl: string | null = null) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  name: `Sponsor ${n}`,
  logoUrl,
  sortOrder: n,
  backdrop: "auto" as const,
});

describe("SponsorCarousel", () => {
  afterEach(() => vi.useRealTimers());

  it("lets the current logo leave before the next comes in", () => {
    vi.useFakeTimers();
    const { container } = render(<SponsorCarousel sponsors={[sponsor(1), sponsor(2)]} intervalMs={5000} />);
    const slide = () => container.querySelector(".sponsor-carousel__slide")!;
    expect(slide().textContent).toBe("Sponsor 1");

    act(() => vi.advanceTimersByTime(5000));
    expect(slide().className).toContain("--leaving");
    expect(slide().textContent).toBe("Sponsor 1");

    act(() => vi.advanceTimersByTime(SPONSOR_LEAVE_MS));
    expect(slide().className).not.toContain("--leaving");
    expect(slide().textContent).toBe("Sponsor 2");
  });

  it("shows the name when a logo can't load", () => {
    const { container } = render(<SponsorCarousel sponsors={[sponsor(1, "/missing.png")]} />);
    act(() => {
      container.querySelector("img")!.dispatchEvent(new Event("error"));
    });
    expect(container.textContent).toBe("Sponsor 1");
  });

  it("draws each backdrop it's asked for", () => {
    const one = (backdrop: "outline" | "mono" | "none") =>
      render(<SponsorCarousel sponsors={[{ ...sponsor(1, "/logo.png"), backdrop }]} />).container;
    expect(one("outline").querySelector(".sponsor-carousel__logo--outline")).not.toBeNull();
    expect(one("mono").querySelector(".sponsor-carousel__mono")?.getAttribute("aria-label")).toBe("Sponsor 1");
    expect(one("none").querySelector("img.sponsor-carousel__logo")).not.toBeNull();
  });
});
