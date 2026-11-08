import { useState } from "react";
import { formatExact } from "@32dashboards/ui";
import { parseAmount } from "./amount.js";

/**
 * A typed-in amount beside the preset buttons ("Other amount" + Add, and optionally Take off). The amount stays
 * after it's added, so the same gift can be added again with one tap; tapping into the box selects it, so typing
 * replaces it. Give it a new `key` to clear it, such as when the Ask Me round changes.
 */
export function AmountForm({
  label,
  onAdd,
  onSubtract,
  compact,
  addLabel = "Add",
}: {
  label: string;
  onAdd: (amount: number) => void;
  /** Offers "Take off" for the same amount, to fix a total without negative numbers. */
  onSubtract?: (amount: number) => void;
  compact?: boolean;
  addLabel?: string;
}) {
  const [text, setText] = useState("");
  const amount = parseAmount(text);
  const done = (run: (amount: number) => void) => {
    if (amount === null) return;
    run(amount);
  };
  return (
    <form
      className={`row amount-form${compact ? " amount-form--compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        done(onAdd);
      }}
    >
      <input
        inputMode="decimal"
        enterKeyHint="done"
        aria-label={label}
        placeholder={compact ? "$" : "Other amount"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          // Safari drops a selection made during focus, so select on the next frame.
          const input = e.currentTarget;
          requestAnimationFrame(() => input.select());
        }}
      />
      <button type="submit" className="primary" disabled={amount === null}>
        {amount !== null && !compact ? `${addLabel} ${formatExact(amount)}` : addLabel}
      </button>
      {onSubtract && (
        <button type="button" disabled={amount === null} onClick={() => done(onSubtract)}>
          Take off
        </button>
      )}
    </form>
  );
}
