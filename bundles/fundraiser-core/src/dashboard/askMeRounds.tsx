import { useEffect, useRef, useState } from "react";
import { useAutosave } from "@32dashboards/nodecg-react";
import { formatExact } from "@32dashboards/ui";
import { MAX_ASK_ME_AMOUNTS, askMeAmounts, type FundraiserEvent } from "@32dashboards/schema/core";
import { parseAmount } from "./amount.js";
import { rebase } from "./rebase.js";
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

  // A change on another device (a round finished, reordered or edited on the phone): take it,
  // keeping whatever is being typed here. What a round raised always comes from the show.
  const show = JSON.stringify(event.askMeRounds);
  const before = useRef(event.askMeRounds);
  useEffect(() => {
    if (before.current === event.askMeRounds) return;
    const was = before.current;
    before.current = event.askMeRounds;
    setRounds((local) =>
      rebase(local, was, event.askMeRounds).map((round) => ({
        ...round,
        raised: event.askMeRounds.find((saved) => saved.id === round.id)!.raised,
      })),
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
              <AmountsField
                label={`Ask Me ${i + 1} amount buttons`}
                appeal={round}
                onChange={(amounts) => edit(i, { amounts })}
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
          setRounds((rs) => [...rs, { id: newId(), title: "", message: "", amounts: [], raised: null }]);
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

/** "200, 100, 50, 25" -> [200, 100, 50, 25]; null if any of it isn't an amount. */
export function parseAmountList(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean);
  const amounts = parts.map(parseAmount);
  return amounts.every((a) => a !== null) ? (amounts as number[]) : null;
}

/**
 * The amount buttons the console shows for an appeal. Left empty, they're the amounts in
 * the message (so the notes and the buttons agree), or the usual ones.
 */
function AmountsField(props: {
  label: string;
  appeal: { amounts: number[]; message: string };
  onChange: (amounts: number[]) => void;
}) {
  const [text, setText] = useState(props.appeal.amounts.join(", "));
  // Changed on the phone: show the new list, unless it's what's typed here.
  const saved = JSON.stringify(props.appeal.amounts);
  useEffect(() => {
    if (JSON.stringify(parseAmountList(text)) !== saved) setText(props.appeal.amounts.join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  return (
    <AmountsInput
      label={props.label}
      message={props.appeal.message}
      text={text}
      onText={(next) => {
        setText(next);
        const amounts = amountListProblem(next) ? null : parseAmountList(next);
        if (amounts) props.onChange(amounts);
      }}
    />
  );
}

/** Why a typed list of amounts can't be used, or null if it can. */
export function amountListProblem(text: string): string | null {
  const parsed = parseAmountList(text);
  if (parsed === null) return "Amounts only, with commas between them, like 200, 100, 50, 25.";
  if (parsed.length > MAX_ASK_ME_AMOUNTS) return `Up to ${MAX_ASK_ME_AMOUNTS} amounts.`;
  return null;
}

/** The typed list of amount buttons, saying what's used when it's left empty. */
export function AmountsInput(props: { label: string; message: string; text: string; onText: (text: string) => void }) {
  const { text } = props;
  const parsed = parseAmountList(text);
  const problem = amountListProblem(text);
  const fallback = askMeAmounts({ amounts: [], message: props.message });
  const fallbackText = fallback.amounts.map((a) => formatExact(a)).join(", ");
  return (
    <label className="field">
      <span>Amount buttons on the phone</span>
      <input
        aria-label={props.label}
        inputMode="decimal"
        placeholder={fallbackText}
        value={text}
        onChange={(e) => props.onText(e.target.value)}
      />
      <span className={problem ? "error" : "muted"}>
        {problem ??
          (parsed!.length
            ? "In this order, biggest ask first if that's how it's called."
            : fallback.from === "message"
              ? `Empty, so the amounts in the message: ${fallbackText}.`
              : `Empty, so the usual ones: ${fallbackText}. Or put amounts like $200 in the message.`)}
      </span>
    </label>
  );
}
