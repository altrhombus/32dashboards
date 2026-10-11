import { useEffect, useState } from "react";
import "./KioskHeader.css";

export interface KioskHeaderProps {
  title: string;
  /** Shown before the title; hidden if it fails to load. */
  logoUrl?: string | null;
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function KioskHeader({ title, logoUrl }: KioskHeaderProps) {
  const [now, setNow] = useState(() => new Date());
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [logoUrl]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="kiosk-header">
      <span className="kiosk-header__brand">
        {logoUrl && !logoFailed && (
          <img className="kiosk-header__logo" src={logoUrl} alt="" onError={() => setLogoFailed(true)} />
        )}
        <span className="kiosk-header__title clamp-1" title={title}>
          {title}
        </span>
      </span>
      <span className="kiosk-header__clock num">{formatClock(now)}</span>
    </div>
  );
}
