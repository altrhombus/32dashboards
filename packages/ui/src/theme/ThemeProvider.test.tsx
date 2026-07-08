import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeProvider.js";
import type { Theme } from "@32dashboards/schema";

const theme: Theme = {
  accentColor: "#00ff00",
  secondaryColor: "#4dd0e1",
  backgroundFrom: "#000000",
  backgroundTo: "#111111",
  logoUrl: null,
  fontDisplay: "Montserrat",
  fontMono: "Share Tech Mono",
};

function Probe() {
  const t = useTheme();
  return <span data-testid="probe">{t.accentColor}</span>;
}

describe("ThemeProvider", () => {
  it("applies the theme's accent color as a CSS custom property", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <span>child</span>
      </ThemeProvider>
    );
    const root = container.querySelector(".theme-root") as HTMLElement;
    expect(root.style.getPropertyValue("--color-accent")).toBe("#00ff00");
  });

  it("exposes the theme to descendants via useTheme", () => {
    render(
      <ThemeProvider theme={theme}>
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByTestId("probe").textContent).toBe("#00ff00");
  });

  it("useTheme throws outside a ThemeProvider", () => {
    // Suppress the expected React error boundary console output for this negative test.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/useTheme must be called within/);
    spy.mockRestore();
  });
});
