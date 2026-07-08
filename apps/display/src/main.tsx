import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@32dashboards/ui/tokens.css";
import { App } from "./App.js";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
