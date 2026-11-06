/// <reference types="nodecg/types/augment-window" />
import { useEffect, useRef, useState } from "react";

/** Re-renders every `ms` so relative times stay fresh. */
export function useNow(ms = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

/** True while the viewport is at most `maxWidth` wide. */
export function useNarrow(maxWidth: number): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return;
    const onChange = () => setNarrow(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return narrow;
}

/** The socketToken cookie NodeCG sets after sign-in; `?key=` with it signs another device in. */
export function signInKey(): string | null {
  const match = /(?:^|;\s*)socketToken=([^;]+)/.exec(document.cookie);
  return match ? decodeURIComponent(match[1]!) : null;
}

/** False once the connection to the laptop has been gone for `graceMs`; shorter blips pass unnoticed. */
export function useConnected(graceMs = 3_000): boolean {
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    const socket = nodecg.socket;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lost = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setConnected(false), graceMs);
    };
    const back = () => {
      clearTimeout(timer);
      setConnected(true);
    };
    if (!socket.connected) lost();
    socket.on("disconnect", lost);
    socket.on("connect", back);
    return () => {
      clearTimeout(timer);
      socket.off("disconnect", lost);
      socket.off("connect", back);
    };
  }, [graceMs]);
  return connected;
}

/**
 * Saves `value` shortly after it stops changing. Leaving the screen saves what's
 * still waiting, so typing and going straight to the next step loses nothing.
 */
export function useAutosave<T>(value: T, save: (value: T) => void, delay = 600): void {
  const first = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;
  const waiting = useRef<string | null>(null);
  const json = JSON.stringify(value);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    waiting.current = json;
    const timer = setTimeout(() => {
      waiting.current = null;
      saveRef.current(JSON.parse(json) as T);
    }, delay);
    return () => clearTimeout(timer);
  }, [json, delay]);
  useEffect(
    () => () => {
      if (waiting.current !== null) saveRef.current(JSON.parse(waiting.current) as T);
    },
    [],
  );
}
