import type { ReactNode } from "react";
import type { LiveLot } from "@32dashboards/schema/core";
import { formatAmount, formatTotal } from "../../display/format.js";
import { renderMarkdown } from "../../display/markdown.js";
import "./LiveAuctionStage.css";

export interface LiveAuctionStageProps {
  /** The item up now; null before there are items, or once every one has had its turn. */
  lot: LiveLot | null;
  number: number;
  count: number;
  /** The item after this one. */
  nextTitle: string | null;
  /** Show the running bid. Off: the item alone, for when nobody's keeping up with the bidding. */
  showBid: boolean;
  /** Every item has had its turn. */
  done: boolean;
  /** What the live auction has sold. */
  raised: number;
  total: number;
  /** A small logo, in the corner. */
  logos?: ReactNode;
}

function Corner({ total, logos }: Pick<LiveAuctionStageProps, "total" | "logos">) {
  return (
    <footer className="live-stage__corner">
      <span className="live-stage__total">
        <span className="num">{formatTotal(total)}</span> raised
      </span>
      {logos && <div className="live-stage__logos">{logos}</div>}
    </footer>
  );
}

/**
 * The live auction. The item and the bid are the whole point, so they take
 * the screen; the total and a logo stay small in the corner. Before there's an
 * item, and after the last one, it holds the room with a title.
 */
export function LiveAuctionStage(props: LiveAuctionStageProps) {
  const { lot, number, count, nextTitle, showBid, done, raised, total, logos } = props;

  if (!lot) {
    return (
      <div className="live-stage live-stage--title">
        <div className="live-stage__headline">{done ? "Thank you!" : "Live auction"}</div>
        {done && raised > 0 && (
          <div className="live-stage__summary">
            The live auction raised <span className="num">{formatAmount(raised)}</span>
          </div>
        )}
        <Corner total={total} logos={logos} />
      </div>
    );
  }

  const title = lot.title || `Live item ${number}`;
  const bid = lot.currentBid;
  return (
    <div className={`live-stage${lot.imageUrl ? "" : " live-stage--no-photo"}`}>
      {lot.imageUrl && (
        <div className="live-stage__media">
          <img className="live-stage__backdrop" src={lot.imageUrl} alt="" aria-hidden="true" />
          <img className="live-stage__image" src={lot.imageUrl} alt="" />
        </div>
      )}
      <div className="live-stage__side">
        <div className="live-stage__kicker">Live auction{count > 1 ? ` · Item ${number} of ${count}` : ""}</div>
        <h1 className="live-stage__title clamp-3" title={title}>
          {title}
        </h1>
        {lot.description && (
          <div
            className="live-stage__description"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(lot.description) }}
          />
        )}
        {lot.value !== null && <div className="live-stage__value num">Worth {formatAmount(lot.value)}</div>}
        {showBid && (
          <div className="live-stage__bid">
            {bid !== null ? (
              <>
                <span className="live-stage__bid-label">Current bid</span>
                {/* key: each new bid arrives with its own bump */}
                <span key={bid} className="live-stage__bid-amount num">
                  {formatAmount(bid)}
                </span>
              </>
            ) : lot.startingBid !== null ? (
              <>
                <span className="live-stage__bid-label">Bidding starts at</span>
                <span className="live-stage__bid-amount num">{formatAmount(lot.startingBid)}</span>
              </>
            ) : null}
          </div>
        )}
        {nextTitle && <div className="live-stage__next clamp-1">Up next: {nextTitle}</div>}
        <Corner total={total} logos={logos} />
      </div>
    </div>
  );
}
