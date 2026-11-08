import { useRef, useState } from "react";
import { formatExact } from "@32dashboards/ui";
import { parseAmount } from "./amount.js";

/** setSelectionRange rather than select(): iOS Safari ignores select() on a tap. */
const selectAll = (input: HTMLInputElement) => input.setSelectionRange(0, input.value.length);

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
  placeholder,
}: {
  label: string;
  onAdd: (amount: number) => void;
  /** Offers "Take off" for the same amount, to fix a total without negative numbers. */
  onSubtract?: (amount: number) => void;
  compact?: boolean;
  addLabel?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const justFocused = useRef(false);
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
        placeholder={placeholder ?? (compact ? "$" : "Other amount")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          selectAll(e.currentTarget);
          justFocused.current = true;
        }}
        // Lifting the finger (or mouse button) puts a cursor where it was, so select again
        // once the tap that focused the box is done; later taps place the cursor as usual.
        onClick={(e) => {
          if (justFocused.current) selectAll(e.currentTarget);
          justFocused.current = false;
        }}
        onBlur={() => (justFocused.current = false)}
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
