import "@testing-library/jest-dom/vitest";

// React 19's act() needs this flag set explicitly under jsdom + vitest;
// without it, timer-driven state updates in tests log spurious warnings.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
