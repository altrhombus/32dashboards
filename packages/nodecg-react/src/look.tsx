import { useEffect, useRef, useState, type RefObject } from "react";
import type { EventTheme } from "@32dashboards/schema/core";
import {
  BUNDLED_FONTS,
  DISPLAY_FONTS,
  NUMBER_FONTS,
  PALETTES,
  fontStack,
  themeFromPixels,
  validateTheme,
  type Palette,
} from "@32dashboards/ui";

/*
 * The pieces of an event's look, shared by the Layouts tab's Event look and
 * the New event setup: palettes, the four colors with their checks, fonts,
 * colors suggested by a logo, uploading a logo, and showing an unsaved look
 * in a kiosk preview. Styles are in look.css.
 */

/**
 * Message a dashboard page posts to a kiosk preview (`?preview`) to try a
 * look before it's saved: `{ type, theme }`, with `theme: null` to go back
 * to the event's own. The preview posts `${type}:ready` when it's listening.
 */
export const PREVIEW_THEME_MESSAGE = "32dashboards:preview-theme";

type Colors = Palette["colors"];

const COLOR_FIELDS = [
  ["accentColor", "Accent", "The total and highlights"],
  ["secondaryColor", "Secondary", "Headings and bars"],
  ["backgroundFrom", "Background, top", "Where the background gradient starts"],
  ["backgroundTo", "Background, bottom", "Where it ends"],
] as const;

const sameColors = (theme: Colors, colors: Colors) =>
  (Object.keys(colors) as (keyof Colors)[]).every((k) => theme[k].toLowerCase() === colors[k].toLowerCase());

/** Starting palettes as swatches; `suggested` (e.g. from the logo) comes first. */
export function PaletteSwatches(props: {
  theme: Colors;
  suggested?: Palette | null;
  onPick: (colors: Colors) => void;
}) {
  const palettes = props.suggested ? [props.suggested, ...PALETTES] : PALETTES;
  return (
    <div className="palettes">
      {palettes.map((p) => (
        <button
          key={p.name}
          type="button"
          className={`palette-swatch${p === props.suggested ? " palette-swatch--suggested" : ""}`}
          aria-pressed={sameColors(props.theme, p.colors)}
          onClick={() => props.onPick(p.colors)}
          style={{ background: `linear-gradient(160deg, ${p.colors.backgroundFrom}, ${p.colors.backgroundTo})` }}
        >
          <span className="palette-swatch__dots" aria-hidden="true">
            <span style={{ background: p.colors.accentColor }} />
            <span style={{ background: p.colors.secondaryColor }} />
          </span>
          <span className="palette-swatch__name" style={{ color: p.colors.accentColor }}>
            {p.name}
          </span>
        </button>
      ))}
    </div>
  );
}

/** The four colors, each with its picker, hex field, and any readability or broadcast warning beside it. */
export function ColorFields(props: { theme: EventTheme; onChange: (patch: Partial<EventTheme>) => void }) {
  const { theme } = props;
  const issues = validateTheme(theme);
  return (
    <>
      {COLOR_FIELDS.map(([key, label, hint]) => (
        <div key={key} className="color-field">
          <input
            type="color"
            aria-label={label}
            value={/^#[0-9a-f]{6}$/i.test(theme[key]) ? theme[key] : "#000000"}
            onChange={(e) => props.onChange({ [key]: e.target.value })}
          />
          <span className="color-field__text">
            <strong>{label}</strong>
            <span className="muted">{hint}</span>
          </span>
          <input
            className="color-field__hex"
            aria-label={`${label}, hex`}
            value={theme[key]}
            maxLength={7}
            onChange={(e) => props.onChange({ [key]: e.target.value.trim() })}
          />
          {issues
            .filter((i) => i.field === key)
            .map((issue, i) => (
              <p key={i} className={`color-field__issue ${issue.level === "error" ? "error" : "warning"}`}>
                {issue.message}
              </p>
            ))}
        </div>
      ))}
      {issues.length === 0 && <p className="status-ok">Readable from across the room, and safe for broadcast.</p>}
    </>
  );
}

export function FontPicker(props: {
  title: string;
  sample: string;
  kind: "display" | "numbers";
  value: string;
  onChange: (family: string) => void;
}) {
  const fonts = props.kind === "display" ? DISPLAY_FONTS : NUMBER_FONTS;
  const fallback = props.kind === "display" ? 'system-ui, "Segoe UI", sans-serif' : "ui-monospace, monospace";
  return (
    <fieldset className="look-group fonts">
      <legend>
        <h2>{props.title}</h2>
      </legend>
      {!BUNDLED_FONTS.has(props.value) && (
        <p className="warning">
          "{props.value}" doesn't ship with the kiosk, so TVs use a system font instead. Pick one below.
        </p>
      )}
      {fonts.map((font) => (
        <label key={font.family} className="font-card">
          <input
            type="radio"
            name={props.title}
            checked={props.value === font.family}
            onChange={() => props.onChange(font.family)}
          />
          <span className="font-card__sample clamp-1" style={{ fontFamily: fontStack(font.family, fallback) }}>
            {props.sample}
          </span>
          <span className="muted">
            {font.family}: {font.note}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Keeps a kiosk preview iframe showing `theme` (null: the event's own look), even across reloads. */
export function usePreviewTheme(frame: RefObject<HTMLIFrameElement | null>, theme: EventTheme | null) {
  const themeRef = useRef(theme);
  themeRef.current = theme;
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: PREVIEW_THEME_MESSAGE, theme }, window.location.origin);
  }, [frame, theme]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === `${PREVIEW_THEME_MESSAGE}:ready`) {
        frame.current?.contentWindow?.postMessage(
          { type: PREVIEW_THEME_MESSAGE, theme: themeRef.current },
          window.location.origin,
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frame]);
}

/** Colors suggested by an image at `url` (same origin, e.g. an uploaded logo), or null while loading or if none. */
export function useLogoColors(url: string | null): Palette | null {
  const [palette, setPalette] = useState<Palette | null>(null);
  useEffect(() => {
    setPalette(null);
    if (!url) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight) || 1;
      ctx.drawImage(image, 0, 0, image.naturalWidth * scale, image.naturalHeight * scale);
      try {
        const colors = themeFromPixels(ctx.getImageData(0, 0, size, size).data);
        setPalette(colors && { name: "From your logo", colors });
      } catch {
        // A cross-origin image can't be read; there's simply no suggestion.
      }
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return palette;
}

/**
 * Uploads a file into one of fundraiser-core's asset categories, as the
 * dashboard's Assets tab does, and resolves with its asset URL once NodeCG
 * lists it.
 */
export async function uploadAsset(category: "event-logos" | "sponsor-logos", file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file, file.name);
  const response = await fetch(`/assets/fundraiser-core/${category}`, {
    method: "POST",
    body,
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`The upload failed (HTTP ${response.status}).`);
  const url = `/assets/fundraiser-core/${category}/${encodeURIComponent(file.name)}`;
  const assets = nodecg.Replicant<{ url: string }[]>(`assets:${category}`, "fundraiser-core");
  for (let i = 0; i < 40; i++) {
    if (assets.value?.some((a) => a.url === url || decodeURIComponent(a.url) === decodeURIComponent(url))) return url;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return url;
}
