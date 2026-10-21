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

/** Which part of the Layouts tab is open: arranging a layout, or an event's look. */
export const BUILDER_MODE_KEY = "32dashboards.builder.mode";

/** The event whose look the Layouts tab is editing. */
export const LOOK_EVENT_KEY = "32dashboards.builder.lookEvent";
