import { useEffect, useState, type ReactNode } from "react";

/** How long a ConfirmButton stays armed for its second tap. */
export const ARM_MS = 4_000;

/**
 * A button that needs a second tap within a few seconds, for actions that
 * end, replace, or delete something. Armed, it turns amber (`.is-armed`) and
 * shows `confirmLabel`.
 */
export function ConfirmButton(props: {
  label: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${props.className ?? ""}${armed ? " is-armed" : ""}`}
      disabled={props.disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          props.onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? props.confirmLabel : props.label}
    </button>
  );
}
