import { useCountdown } from "../../hooks/useCountdown.js";
import "./CountdownClock.css";

export interface CountdownClockProps {
  endDateTime: string | null;
  onExpire?: () => void;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function CountdownClock({ endDateTime, onExpire }: CountdownClockProps) {
  const { hours, minutes, seconds, tenths } = useCountdown(endDateTime, onExpire);

  if (!endDateTime) {
    return (
      <div className="countdown-clock">
        <span className="countdown-clock__value">--:--:--</span>
      </div>
    );
  }

  return (
    <div className="countdown-clock">
      <span className="countdown-clock__value">
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
        {tenths !== null && <span className="countdown-clock__tenths">.{tenths}</span>}
      </span>
    </div>
  );
}
