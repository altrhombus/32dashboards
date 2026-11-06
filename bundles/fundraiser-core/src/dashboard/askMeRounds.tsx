import { useEffect, useRef, useState } from "react";
import { useAutosave } from "@32dashboards/nodecg-react";
import { formatExact } from "@32dashboards/ui";
import type { FundraiserEvent } from "@32dashboards/schema/core";
import "./askMeRounds.css";

/** Past this many characters, an appeal's text shrinks on the TV to fit. */
const LONG_APPEAL = 300;

const newId = () => crypto.randomUUID();

export type DraftRound = FundraiserEvent["askMeRounds"][number];

/**
 * The event's Ask Me appeals, edited in place and saved as you type, with the
 * same fields wherever it's used (the New event guide and Show content). A
 * round the show has finished keeps what it raised and its place at the top;
 * rounds still to come can be reordered and removed.
 */
export function AskMeRoundsEditor(props: {
  event: FundraiserEvent;
  save: (rounds: DraftRound[], editing: number) => void;
  /** The round being edited, for a preview beside this. */
  editing: number;
  onEditing: (index: number) => void;
}) {
  const { event, editing, onEditing } = props;
  const [rounds, setRounds] = useState<DraftRound[]>(event.askMeRounds);
  useAutosave(rounds, (v) => props.save(v, editing));

  // A round finished on another device: take its state, keeping whatever is being typed here.
  const show = JSON.stringify(event.askMeRounds.map((r) => [r.id, r.raised]));
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setRounds((local) =>
      event.askMeRounds.map((saved) => {
        const mine = local.find((r) => r.id === saved.id);
        return mine ? { ...saved, title: mine.title, message: mine.message } : saved;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const edit = (index: number, patch: Partial<DraftRound>) =>
    setRounds((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const firstOpen = rounds.findIndex((r) => r.raised === null);
  const move = (index: number, by: number) => {
    const to = index + by;
    if (to < Math.max(firstOpen, 0) || to >= rounds.length) return;
    setRounds((rs) => {
      const next = [...rs];
      [next[index], next[to]] = [next[to]!, next[index]!];
      return next;
    });
    onEditing(to);
  };

  return (
    <>
      {rounds.length === 0 && (
        <p className="muted">No appeals planned, so Ask Me runs as one appeal (its title and message are below).</p>
      )}
      <ol className="appeals">
        {rounds.map((round, i) => {
          const finished = round.raised !== null;
          return (
            <li
              key={round.id}
              className={`appeal${i === editing ? " appeal--editing" : ""}`}
              onFocus={() => onEditing(i)}
              onPointerDown={() => onEditing(i)}
            >
              <div className="appeal__head">
                <strong>Ask Me {i + 1}</strong>
                {finished && <span className="muted">Finished: raised {formatExact(round.raised!)}</span>}
                <span className="grow" />
                {!finished && (
                  <>
                    <button
                      type="button"
                      aria-label={`Move Ask Me ${i + 1} up`}
                      disabled={i === 0 || i === firstOpen}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move Ask Me ${i + 1} down`}
                      disabled={i === rounds.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRounds((rs) => rs.filter((_, j) => j !== i));
                        onEditing(Math.max(0, i - 1));
                      }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
              <input
                aria-label={`Ask Me ${i + 1} title`}
                placeholder="Title, e.g. Fund a kennel"
                maxLength={120}
                value={round.title}
                onChange={(e) => edit(i, { title: e.target.value })}
              />
              <textarea
                aria-label={`Ask Me ${i + 1} message`}
                rows={6}
                maxLength={1200}
                placeholder={
                  "What the room should know, e.g.\nEvery **$250** builds one new kennel.\n- Shelter for a dog in need\n- Built by local volunteers"
                }
                value={round.message}
                onChange={(e) => edit(i, { message: e.target.value })}
              />
              <span className="muted">
                {round.message.length > LONG_APPEAL
                  ? `${round.message.length} characters: the TV shrinks the text to fit. Shorter reads better from across the room.`
                  : `${round.message.length} characters`}
              </span>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        disabled={rounds.length >= 20}
        onClick={() => {
          setRounds((rs) => [...rs, { id: newId(), title: "", message: "", raised: null }]);
          onEditing(rounds.length);
        }}
      >
        {rounds.length ? "Add another appeal" : "Add an appeal"}
      </button>
      <p className="muted">
        Saved as you type. Messages can use **bold**, *italics*, lists (start lines with "- " or "1. "), and # headings.
      </p>
    </>
  );
}
