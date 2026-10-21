/** localStorage key for the layout open in the builder; the Screens panel writes it to open one there. */
export const SELECTED_LAYOUT_KEY = "32dashboards.builder.layout";

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; everything works without it.
  }
}
