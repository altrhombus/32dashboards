import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // In production, nginx (M10) reverse-proxies these same paths onto
      // one origin -- proxying here in dev keeps the app's own code
      // identical between dev and prod (no location.hostname sniffing).
      "/api": "http://localhost:8090",
      "/events": "http://localhost:8090",
    },
  },
});
