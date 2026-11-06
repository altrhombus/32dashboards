import type { SourceItem } from "@32dashboards/schema/core";
import { formatAmount } from "../../display/format.js";
import { useRotation } from "../../hooks/useRotation.js";
import { durations, featuredItemsGridSize } from "../../tokens/tokens.js";
import "./FeaturedItemsGrid.css";

export interface FeaturedItemsGridProps {
  /** Already filtered/selected by the caller -- this component only handles rotation + layout. */
  items: SourceItem[];
  rotationMs?: number;
  /** Cards visible at once. */
  size?: number;
  /** False while another view has this space: it waits, and carries on from there. */
  active?: boolean;
}

export function FeaturedItemsGrid({
  items,
  rotationMs = durations.featuredItemRotationMs,
  size = featuredItemsGridSize,
  active = true,
}: FeaturedItemsGridProps) {
  const { visible, step } = useRotation(items, size, rotationMs, active);

  if (items.length === 0) {
    return <div className="featured-items-grid featured-items-grid--empty">No featured items right now</div>;
  }

  return (
    <div className="featured-items-grid">
      {visible.map((item, i) => (
        <div className="featured-items-grid__card" key={`${step}-${i}`}>
          {item.imageUrl && (
            // The whole picture (many are scanned flyers), over a blurred copy that fills the frame.
            <div className="featured-items-grid__media">
              <img className="featured-items-grid__backdrop" src={item.imageUrl} alt="" aria-hidden="true" />
              <img
                className="featured-items-grid__image"
                src={item.imageUrl}
                alt=""
                onError={(e) => {
                  (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                }}
              />
            </div>
          )}
          <div className="featured-items-grid__title clamp-2" title={item.title}>
            {item.title || "Untitled item"}
          </div>
          {/* Price on the left, bids on the right: one line, so the picture gets the room. */}
          {(item.currentBid !== null || item.bidCount !== null) && (
            <div className="featured-items-grid__meta">
              {item.currentBid !== null && (
                <span className="featured-items-grid__price num">{formatAmount(item.currentBid)}</span>
              )}
              {item.bidCount === 0 ? (
                <span className="featured-items-grid__first">Be the first!</span>
              ) : (
                item.bidCount !== null && (
                  <span className="featured-items-grid__bids num">
                    {item.bidCount} bid{item.bidCount === 1 ? "" : "s"}
                  </span>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
