import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React 19's act() needs this flag set explicitly under jsdom + vitest;
// without it, timer-driven state updates in tests log spurious warnings.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Vitest doesn't enable globals here, so testing-library can't register its own cleanup.
afterEach(cleanup);

// jsdom lacks these browser APIs; components degrade gracefully without them.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
