import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "frontend",
  plugins: [react()],
  resolve: {
    alias: {
      jsonwebtoken: normalizePath(
        fileURLToPath(new URL("./src/circle-wallet/jsonwebtoken-browser.ts", import.meta.url)),
      ),
    },
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
