import { useEffect, useState } from "react";

/*
 * Whether a logo needs a plate behind it to read on a background: when it's
 * mostly see-through and most of what shows is low-contrast against the
 * background (dark ink on a dark theme, light ink on a light one). Logos
 * with their own solid background never do.
 */

export interface LogoCheck {
  /** Natural width / height, for sizing a plate to the logo. */
  ratio: number;
  needsPlate: boolean;
}

/** Share of pixels that are see-through before a logo counts as transparent. */
const TRANSPARENT_SHARE = 0.15;
/** Share of the visible pixels below 3:1 contrast with the background before it needs a plate. */
const LOW_CONTRAST_SHARE = 0.4;

const luminance = (r: number, g: number, b: number) => {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const hexLuminance = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? luminance(parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)) : 0;
};

/** Judges RGBA pixels against a background luminance. */
export function judgeLogo(pixels: Uint8ClampedArray, backgroundLuminance: number): boolean {
  let clear = 0;
  let visible = 0;
  let low = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3]! < 40) {
      clear++;
      continue;
    }
    visible++;
    const l = luminance(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
    const contrast = (Math.max(l, backgroundLuminance) + 0.05) / (Math.min(l, backgroundLuminance) + 0.05);
    if (contrast < 3) low++;
  }
  const total = pixels.length / 4;
  return total > 0 && visible > 0 && clear / total >= TRANSPARENT_SHARE && low / visible >= LOW_CONTRAST_SHARE;
}

const cache = new Map<string, Promise<LogoCheck | null>>();

/** Loads and judges a logo once per logo and background; null if it can't be read (e.g. another site's). */
export function checkLogo(url: string, background: string): Promise<LogoCheck | null> {
  const key = `${background}|${url}`;
  let found = cache.get(key);
  if (!found) {
    found = new Promise<LogoCheck | null>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const ratio = image.naturalWidth / Math.max(image.naturalHeight, 1) || 1;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 160;
          canvas.height = Math.max(1, Math.round(160 / ratio));
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return resolve({ ratio, needsPlate: false });
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          resolve({ ratio, needsPlate: judgeLogo(pixels, hexLuminance(background)) });
        } catch {
          resolve({ ratio, needsPlate: false });
        }
      };
      image.onerror = () => resolve(null);
      image.src = url;
    });
    cache.set(key, found);
  }
  return found;
}

/** The check for a logo on a background, once it's done (null until then, or if it can't be read). */
export function useLogoCheck(url: string | null, background: string): LogoCheck | null {
  const [check, setCheck] = useState<LogoCheck | null>(null);
  useEffect(() => {
    setCheck(null);
    if (!url) return;
    let live = true;
    void checkLogo(url, background).then((c) => live && setCheck(c));
    return () => {
      live = false;
    };
  }, [url, background]);
  return check;
}
