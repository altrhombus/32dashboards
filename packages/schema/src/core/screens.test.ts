import { describe, expect, it } from "vitest";
import { screenPresence } from "./screens.js";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();
const output = (instanceId: string, screenId: string | null, lastSeen = 5, output = "kiosk") => ({
  instanceId,
  output,
  screenId,
  firstSeenAt: at(600),
  lastSeenAt: at(lastSeen),
});

describe("screenPresence", () => {
  const screens = [
    { id: "left", name: "Left TV", layouts: {} },
    { id: "right", name: "Right TV", layouts: {} },
  ];

  it("marks named screens connected only while their kiosk checks in", () => {
    const { named, unnamed } = screenPresence(screens, [output("a", "left"), output("b", "right", 45)], NOW);
    expect(named.map((n) => [n.screen.id, n.connected])).toEqual([
      ["left", true],
      ["right", false],
    ]);
    expect(named[0]!.since).toBe(at(600));
    expect(unnamed).toEqual([]);
  });

  it("lists kiosks without a named screen, and ignores other outputs", () => {
    const { unnamed } = screenPresence(
      screens,
      [output("a", null), output("b", "lobby"), output("c", null, 5, "stream")],
      NOW,
    );
    expect(unnamed.map((u) => u.screenId)).toEqual([null, "lobby"]);
  });
});
