import { useEffect, useRef, useState } from "react";
import { SseEventSchema, type SseEvent } from "@32dashboards/schema";

export type SseStatus = "connecting" | "open" | "error";

const EVENT_TYPES: SseEvent["type"][] = ["config", "auction-state", "ping"];

/**
 * Thin, generic wrapper around EventSource -- validates every incoming
 * message against SseEventSchema before handing it to the caller, and
 * relies on the browser's native auto-reconnect rather than reimplementing
 * backoff. Callback is held in a ref so reconnects don't thrash every time
 * the caller passes a fresh inline function.
 */
export function useSSE(url: string, onEvent: (event: SseEvent) => void): SseStatus {
  const [status, setStatus] = useState<SseStatus>("connecting");
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    setStatus("connecting");
    const source = new EventSource(url);

    const listeners = EVENT_TYPES.map((type) => {
      const listener = (evt: MessageEvent<string>) => {
        let raw: unknown;
        try {
          raw = JSON.parse(evt.data);
        } catch {
          return;
        }
        const parsed = SseEventSchema.safeParse({ type, data: raw });
        if (parsed.success) {
          setStatus("open");
          onEventRef.current(parsed.data);
        }
      };
      source.addEventListener(type, listener);
      return { type, listener };
    });

    source.onerror = () => setStatus("error");

    return () => {
      for (const { type, listener } of listeners) {
        source.removeEventListener(type, listener);
      }
      source.close();
    };
  }, [url]);

  return status;
}
