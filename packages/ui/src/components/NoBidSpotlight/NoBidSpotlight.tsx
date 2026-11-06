import type { SourceItem } from "@32dashboards/schema/core";
import { formatAmount } from "../../display/format.js";
import { useRotation } from "../../hooks/useRotation.js";
import { QrCode } from "../QrCode/QrCode.js";
import "./NoBidSpotlight.css";

export interface NoBidSpotlightProps {
  /** Items still waiting for a first bid, already chosen by the caller. */
  items: SourceItem[];
  /** Items on screen at once. */
  size?: number;
  rotationMs?: number;
  /** For a block sharing the screen: each item side-on, with less around it. */
  compact?: boolean;
  /** False while another view has this space: it waits, and carries on from there. */
  active?: boolean;
}

/** Long enough to read an item, pull out a phone and scan its code. */
const ROTATION_MS = 20_000;

/**
 * A few items at a time, large, that nobody has bid on yet, each with a QR
 * code that opens it. Slower and closer than the featured grid: its job is to
 * get someone to reach for their phone.
 */
export function NoBidSpotlight({
  items,
  size = 2,
  rotationMs = ROTATION_MS,
  compact = false,
  active = true,
}: NoBidSpotlightProps) {
  const { visible, step } = useRotation(items, size, rotationMs, active);

  if (items.length === 0) {
    return <div className="no-bid-spotlight no-bid-spotlight--empty">Every item has a bid. Thank you!</div>;
  }

  return (
    <div className={`no-bid-spotlight${compact ? " no-bid-spotlight--compact" : ""}`}>
      <h2 className="no-bid-spotlight__heading">
        No bids yet. Be the first!
        {items.length > size && <span className="no-bid-spotlight__count num">{items.length} items waiting</span>}
      </h2>
      <div className="no-bid-spotlight__items" data-size={visible.length}>
        {visible.map((item, i) => (
          <article className="no-bid-spotlight__item" key={`${step}-${i}`}>
            {item.imageUrl && (
              <div className="no-bid-spotlight__media">
                <img className="no-bid-spotlight__backdrop" src={item.imageUrl} alt="" aria-hidden="true" />
                <img
                  className="no-bid-spotlight__image"
                  src={item.imageUrl}
                  alt=""
                  onError={(e) => {
                    (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                  }}
                />
              </div>
            )}
            <div className="no-bid-spotlight__details">
              <div className="no-bid-spotlight__text">
                <div className="no-bid-spotlight__title clamp-2" title={item.title}>
                  {item.title || "Untitled item"}
                </div>
                {item.currentBid !== null && (
                  <div className="no-bid-spotlight__price num">Starts at {formatAmount(item.currentBid)}</div>
                )}
                {item.value !== null && (
                  <div className="no-bid-spotlight__value num">Worth {formatAmount(item.value)}</div>
                )}
              </div>
              {item.url && (
                <figure className="no-bid-spotlight__qr">
                  <QrCode url={item.url} label={`QR code to bid on ${item.title}`} />
                  <figcaption>Scan to bid</figcaption>
                </figure>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
