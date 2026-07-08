import { useEffect, useState } from "react";
import type { ScrapedItem } from "@32dashboards/schema";
import { durations, featuredItemsGridSize } from "../../tokens/tokens.js";
import "./FeaturedItemsGrid.css";

export interface FeaturedItemsGridProps {
  /** Already filtered/selected by the caller -- this component only handles rotation + layout. */
  items: ScrapedItem[];
  rotationMs?: number;
}

function itemsKey(items: ScrapedItem[]): string {
  return items.map((item) => `${item.title}|${item.price}|${item.value}|${item.bids}`).join("||");
}

export function FeaturedItemsGrid({ items, rotationMs = durations.featuredItemRotationMs }: FeaturedItemsGridProps) {
  const [rotationIndex, setRotationIndex] = useState(0);
  const key = itemsKey(items);

  useEffect(() => {
    setRotationIndex(0);
  }, [key]);

  useEffect(() => {
    if (items.length <= featuredItemsGridSize) return;
    const interval = setInterval(() => {
      setRotationIndex((i) => (i + featuredItemsGridSize) % items.length);
    }, rotationMs);
    return () => clearInterval(interval);
  }, [items.length, rotationMs]);

  if (items.length === 0) {
    return <div className="featured-items-grid featured-items-grid--empty">No featured items right now</div>;
  }

  const visibleCount = Math.min(featuredItemsGridSize, items.length);
  const visible = Array.from({ length: visibleCount }, (_, i) => items[(rotationIndex + i) % items.length]);

  return (
    <div className="featured-items-grid">
      {visible.map((item, i) => (
        <div className="featured-items-grid__card" key={`${rotationIndex}-${i}`}>
          {item?.picture_url && (
            <img
              className="featured-items-grid__image"
              src={item.picture_url}
              alt={item.title ?? ""}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <div className="featured-items-grid__title">{item?.title}</div>
          <div className="featured-items-grid__price">{item?.price}</div>
          {item?.bids !== null && <div className="featured-items-grid__bids">{item?.bids} bids</div>}
        </div>
      ))}
    </div>
  );
}
