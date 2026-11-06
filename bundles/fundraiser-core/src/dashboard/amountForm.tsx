import { useState } from "react";
import { parseAmount } from "./amount.js";

/** A typed-in amount beside the preset buttons ("Other amount" + Add, and optionally Take off). */
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
    setText("");
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
      />
      <button type="submit" className="primary" disabled={amount === null}>
        {addLabel}
      </button>
      {onSubtract && (
        <button type="button" disabled={amount === null} onClick={() => done(onSubtract)}>
          Take off
        </button>
      )}
    </form>
  );
}
