import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadDotEnv } from "../../scripts/load-env.js";

describe("loadDotEnv", () => {
  it("loads .env values without overriding existing environment variables", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "stopdown-env-"));
    const previousLoaded = process.env.STOPDOWN_TEST_LOADED;
    const previousExisting = process.env.STOPDOWN_TEST_EXISTING;

    try {
      process.env.STOPDOWN_TEST_EXISTING = "from-process";
      await writeFile(
        path.join(tempDir, ".env"),
        [
          "STOPDOWN_TEST_LOADED=from-file",
          "STOPDOWN_TEST_QUOTED=\"quoted value\"",
          "STOPDOWN_TEST_EXISTING=from-file",
        ].join("\n")
      );

      await loadDotEnv(tempDir);

      assert.equal(process.env.STOPDOWN_TEST_LOADED, "from-file");
      assert.equal(process.env.STOPDOWN_TEST_QUOTED, "quoted value");
      assert.equal(process.env.STOPDOWN_TEST_EXISTING, "from-process");
    } finally {
      restoreEnv("STOPDOWN_TEST_LOADED", previousLoaded);
      restoreEnv("STOPDOWN_TEST_QUOTED", undefined);
      restoreEnv("STOPDOWN_TEST_EXISTING", previousExisting);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("ignores missing .env files", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "stopdown-env-"));

    try {
      await loadDotEnv(tempDir);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
