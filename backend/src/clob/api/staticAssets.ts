import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { URL } from "node:url";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export async function tryServeStaticAsset(
  request: IncomingMessage,
  response: ServerResponse,
  staticDir: string
): Promise<boolean> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/v1" || url.pathname.startsWith("/v1/")) {
    return false;
  }

  const root = path.resolve(staticDir);
  const requestedPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const assetPath = requestedPath === "" ? "index.html" : requestedPath;
  const candidate = path.resolve(root, assetPath);

  if (!isWithinRoot(root, candidate)) {
    return false;
  }

  const filePath = (await isFile(candidate)) ? candidate : path.join(root, "index.html");
  if (!(await isFile(filePath))) {
    return false;
  }

  const body = await readFile(filePath);
  response.writeHead(200, {
    "content-type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "cache-control": filePath.endsWith("index.html")
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  });
  response.end(request.method === "HEAD" ? undefined : body);
  return true;
}

function isWithinRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}
