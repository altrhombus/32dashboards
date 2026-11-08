import { describe, expect, it } from "vitest";
import { DEFAULT_ASK_ME_AMOUNTS, amountsInText, askMeAmounts, askMeProgress } from "./askme.js";
import { AskMeConfigSchema } from "../askme.js";

describe("amountsInText", () => {
  it("finds the amounts in the order they're called out", () => {
    const message = "- **$200** feeds a family for a month\n- $100 buys school supplies\n- $50 or $25 helps too";
    expect(amountsInText(message)).toEqual([200, 100, 50, 25]);
  });

  it("reads thousands and cents, and counts repeats once", () => {
    expect(amountsInText("$1,000 or $2500, even $12.50. Yes, $1,000!")).toEqual([1000, 2500, 12.5]);
  });

  it("finds nothing without a dollar sign", () => {
    expect(amountsInText("Raise a paddle for 100 kids")).toEqual([]);
  });
});

describe("askMeAmounts", () => {
  it("prefers amounts set on the round, then the message, then the usual ones", () => {
    expect(askMeAmounts({ amounts: [75], message: "$200" })).toEqual({ amounts: [75], from: "set" });
    expect(askMeAmounts({ amounts: [], message: "$200" })).toEqual({ amounts: [200], from: "message" });
    expect(askMeAmounts({ amounts: [], message: "" })).toEqual({ amounts: DEFAULT_ASK_ME_AMOUNTS, from: "usual" });
  });
});

describe("askMeProgress", () => {
  const base = { askMe: AskMeConfigSchema.parse({}), askMeRounds: [], askMeCurrent: 0 };

  it("gives the buttons for the round on now", () => {
    const event = {
      ...base,
      askMeRounds: [
        { id: "00000000-0000-4000-8000-000000000011", title: "Meals", message: "$200, $100", amounts: [], raised: 300 },
        { id: "00000000-0000-4000-8000-000000000012", title: "Books", message: "", amounts: [40, 20], raised: null },
      ],
      askMeCurrent: 1,
    };
    expect(askMeProgress(event).amounts).toEqual([40, 20]);
  });

  it("uses the single appeal's message when there are no rounds", () => {
    const event = { ...base, askMe: { ...base.askMe, message: "Give **$150** tonight" } };
    expect(askMeProgress(event).amounts).toEqual([150]);
  });
});
