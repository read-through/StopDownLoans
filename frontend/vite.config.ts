import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  root: "frontend",
  plugins: [react(), demoEntrypoint(mode)],
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
}));

function demoEntrypoint(mode: string): Plugin {
  return {
    name: "stopdown-demo-entrypoint",
    transformIndexHtml(html) {
      if (mode !== "demo") {
        return html;
      }

      return html.replace("/src/main.tsx", toViteFsPath("../mocks/frontend/main.demo.tsx"));
    },
  };
}

function toViteFsPath(relativePath: string): string {
  const absolutePath = fileURLToPath(new URL(relativePath, import.meta.url));
  return `/@fs/${absolutePath.replace(/\\/g, "/")}`;
}
