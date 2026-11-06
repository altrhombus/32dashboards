import { useEffect, useRef, useState } from "react";
import { errorText, uploadAsset, useAutosave } from "@32dashboards/nodecg-react";
import { lotFinished, type FundraiserEvent, type LiveLot } from "@32dashboards/schema/core";
import { formatExact } from "@32dashboards/ui";
import "./askMeRounds.css";

const newId = () => crypto.randomUUID();

const blankLot = (): LiveLot => ({
  id: newId(),
  title: "",
  description: "",
  imageUrl: null,
  value: null,
  startingBid: null,
  currentBid: null,
  soldFor: null,
  paddle: "",
  passed: false,
});

/** "1,500" -> 1500; empty or nonsense -> null. */
const money = (text: string) => {
  const digits = text.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : null;
};

/**
 * The live auction's items, saved as you type. They aren't on the auction
 * site, so everything shown about them starts here, photo included (a phone
 * can take one on the spot). Items that have had their turn keep their place.
 */
export function LiveLotsEditor({ event, save }: { event: FundraiserEvent; save: (lots: LiveLot[]) => void }) {
  const [lots, setLots] = useState<LiveLot[]>(event.liveLots);
  const [problem, setProblem] = useState<string | null>(null);
  useAutosave(lots, save);

  // An item sold on another device: take its state, keeping whatever is being typed here.
  const show = JSON.stringify(event.liveLots.map((l) => [l.id, l.soldFor, l.passed]));
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setLots((local) =>
      event.liveLots.map((saved) => ({ ...(local.find((l) => l.id === saved.id) ?? saved), ...state(saved) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const edit = (index: number, patch: Partial<LiveLot>) =>
    setLots((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const firstOpen = lots.findIndex((l) => !lotFinished(l));
  const move = (index: number, by: number) => {
    const to = index + by;
    if (to < Math.max(firstOpen, 0) || to >= lots.length) return;
    setLots((ls) => {
      const next = [...ls];
      [next[index], next[to]] = [next[to]!, next[index]!];
      return next;
    });
  };
  const upload = (index: number, lot: LiveLot, file: File) => {
    setProblem(null);
    // Phones call every photo image.jpg, and the same name would replace another item's photo.
    const named = new File([file], `${lot.id}-${file.name}`, { type: file.type });
    uploadAsset("live-items", named).then(
      (imageUrl) => edit(index, { imageUrl }),
      (err) => setProblem(errorText(err)),
    );
  };

  return (
    <>
      {lots.length === 0 && (
        <p className="muted">
          No items yet. Without any, the Live auction scene shows a title, the total and your logos.
        </p>
      )}
      <ol className="appeals">
        {lots.map((lot, i) => {
          const finished = lotFinished(lot);
          return (
            <li key={lot.id} className="appeal">
              <div className="appeal__head">
                <strong>Item {i + 1}</strong>
                {lot.soldFor !== null && <span className="muted">Sold for {formatExact(lot.soldFor)}</span>}
                {lot.passed && <span className="muted">No sale</span>}
                <span className="grow" />
                {!finished && (
                  <>
                    <button
                      type="button"
                      aria-label={`Move item ${i + 1} up`}
                      disabled={i === 0 || i === firstOpen}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move item ${i + 1} down`}
                      disabled={i === lots.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                    <button type="button" onClick={() => setLots((ls) => ls.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </>
                )}
              </div>
              <input
                aria-label={`Item ${i + 1} title`}
                placeholder="Title, e.g. Week at the lake house"
                maxLength={120}
                value={lot.title}
                onChange={(e) => edit(i, { title: e.target.value })}
              />
              <textarea
                aria-label={`Item ${i + 1} description`}
                rows={4}
                maxLength={400}
                placeholder={
                  "Why it's worth having, e.g.\nSeven nights, **boat included**.\n- Sleeps eight\n- On the water"
                }
                value={lot.description}
                onChange={(e) => edit(i, { description: e.target.value })}
              />
              <div className="row">
                <label className="field">
                  <span className="muted">Worth ($)</span>
                  <input
                    inputMode="numeric"
                    value={lot.value ?? ""}
                    onChange={(e) => edit(i, { value: money(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span className="muted">Bidding starts at ($)</span>
                  <input
                    inputMode="numeric"
                    value={lot.startingBid ?? ""}
                    onChange={(e) => edit(i, { startingBid: money(e.target.value) })}
                  />
                </label>
              </div>
              <div className="row">
                {lot.imageUrl && <img className="live-lot__photo" src={lot.imageUrl} alt="" />}
                <label className="upload">
                  <span>{lot.imageUrl ? "Use a different photo" : "Add a photo"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    aria-label={`Item ${i + 1} photo`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) upload(i, lot, file);
                    }}
                  />
                </label>
                {lot.imageUrl && (
                  <button type="button" onClick={() => edit(i, { imageUrl: null })}>
                    Remove the photo
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {problem && <p className="error">{problem}</p>}
      <button type="button" disabled={lots.length >= 30} onClick={() => setLots((ls) => [...ls, blankLot()])}>
        {lots.length ? "Add another item" : "Add an item"}
      </button>
      <p className="muted">
        Saved as you type. Descriptions can use **bold**, *italics* and lists (start lines with "- "). A few short lines
        read best from across the room.
      </p>
    </>
  );
}

const state = ({ currentBid, soldFor, paddle, passed }: LiveLot) => ({ currentBid, soldFor, paddle, passed });
