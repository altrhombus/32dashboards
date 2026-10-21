/**
 * Message a dashboard page posts to a kiosk preview (`?preview`) to try a
 * look before it's saved: `{ type, theme }`, with `theme: null` to go back
 * to the event's own. The preview posts `${type}:ready` when it's listening.
 */
export const PREVIEW_THEME_MESSAGE = "32dashboards:preview-theme";
