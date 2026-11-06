import { useCountdown } from "../../hooks/useCountdown.js";
import "./CountdownClock.css";

export interface CountdownClockProps {
  endDateTime: string | null;
  onExpire?: () => void;
  /** In the last this-many ms, the clock calls attention to itself (and more so in the last minute). Default: never. */
  urgentMs?: number;
  /** Shown instead of 00:00:00 once time's up, e.g. "Bidding closed". */
  endedLabel?: string;
}

const FINAL_MS = 60_000;

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function CountdownClock({ endDateTime, onExpire, urgentMs = 0, endedLabel }: CountdownClockProps) {
  const { hours, minutes, seconds, tenths, totalMs, isExpired } = useCountdown(endDateTime, onExpire);

  if (!endDateTime) {
    return (
      <div className="countdown-clock">
        <span className="countdown-clock__value">--:--:--</span>
      </div>
    );
  }

  if (isExpired && endedLabel) {
    return (
      <div className="countdown-clock countdown-clock--ended">
        <span className="countdown-clock__value">{endedLabel}</span>
      </div>
    );
  }

  const urgency =
    isExpired || totalMs >= urgentMs ? "" : totalMs < FINAL_MS ? " countdown-clock--final" : " countdown-clock--soon";
  return (
    <div className={`countdown-clock${urgency}`}>
      <span className="countdown-clock__value">
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
        {tenths !== null && <span className="countdown-clock__tenths">.{tenths}</span>}
      </span>
    </div>
  );
}
