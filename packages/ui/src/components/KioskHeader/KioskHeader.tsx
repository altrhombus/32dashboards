import { useEffect, useState } from "react";
import "./KioskHeader.css";

export interface KioskHeaderProps {
  title: string;
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function KioskHeader({ title }: KioskHeaderProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="kiosk-header">
      <span className="kiosk-header__title">{title}</span>
      <span className="kiosk-header__clock">{formatClock(now)}</span>
    </div>
  );
}
