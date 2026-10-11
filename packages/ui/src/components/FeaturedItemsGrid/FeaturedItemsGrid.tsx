import { useEffect, useState } from "react";
import type { SourceItem } from "@32dashboards/schema/core";
import { formatAmount } from "../../display/format.js";
import { durations, featuredItemsGridSize } from "../../tokens/tokens.js";
import "./FeaturedItemsGrid.css";

export interface FeaturedItemsGridProps {
  /** Already filtered/selected by the caller -- this component only handles rotation + layout. */
  items: SourceItem[];
  rotationMs?: number;
  /** Cards visible at once. */
  size?: number;
}

function itemsKey(items: SourceItem[]): string {
  return items.map((item) => `${item.id}|${item.currentBid}|${item.bidCount}`).join("||");
}

export function FeaturedItemsGrid({
  items,
  rotationMs = durations.featuredItemRotationMs,
  size = featuredItemsGridSize,
}: FeaturedItemsGridProps) {
  const [rotationIndex, setRotationIndex] = useState(0);
  const key = itemsKey(items);

  useEffect(() => {
    setRotationIndex(0);
  }, [key]);

  useEffect(() => {
    if (items.length <= size) return;
    const interval = setInterval(() => {
      setRotationIndex((i) => (i + size) % items.length);
    }, rotationMs);
    return () => clearInterval(interval);
  }, [items.length, rotationMs, size]);

  if (items.length === 0) {
    return <div className="featured-items-grid featured-items-grid--empty">No featured items right now</div>;
  }

  const visibleCount = Math.min(size, items.length);
  const visible = Array.from({ length: visibleCount }, (_, i) => items[(rotationIndex + i) % items.length]!);

  return (
    <div className="featured-items-grid">
      {visible.map((item, i) => (
        <div className="featured-items-grid__card" key={`${rotationIndex}-${i}`}>
          {item.imageUrl && (
            <img
              className="featured-items-grid__image"
              src={item.imageUrl}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <div className="featured-items-grid__title clamp-2" title={item.title}>
            {item.title || "Untitled item"}
          </div>
          {item.currentBid !== null && (
            <div className="featured-items-grid__price num">{formatAmount(item.currentBid)}</div>
          )}
          {item.bidCount !== null && (
            <div className="featured-items-grid__bids num">
              {item.bidCount} bid{item.bidCount === 1 ? "" : "s"}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
