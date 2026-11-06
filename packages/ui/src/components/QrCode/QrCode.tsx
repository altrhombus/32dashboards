import { useMemo } from "react";
import { renderSVG } from "uqr";
import "./QrCode.css";

export interface QrCodeProps {
  url: string;
  /** Says what it opens, for anything reading the screen rather than scanning it. */
  label: string;
  className?: string;
}

/**
 * A QR code on a white plate, whatever the event's colors: phones need the
 * contrast and the quiet border to read it from across a table.
 */
export function QrCode({ url, label, className }: QrCodeProps) {
  const svg = useMemo(() => renderSVG(url, { border: 2 }), [url]);
  return (
    <div
      className={`qr-code${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
