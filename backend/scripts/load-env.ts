import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadDotEnv(projectRoot: string = process.cwd()): Promise<void> {
  const envPath = path.join(projectRoot, ".env");
  let content: string;

  try {
    content = await readFile(envPath, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return;
    }

    throw error;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = parseEnvValue(line.slice(separator + 1).trim());
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
