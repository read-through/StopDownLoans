import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { tryServeStaticAsset } from "../../../src/clob/api/staticAssets.js";

describe("tryServeStaticAsset", () => {
  it("serves the frontend entrypoint and leaves API paths to the API router", async () => {
    const staticDir = await mkdtemp(path.join(tmpdir(), "stopdown-static-"));
    await writeFile(path.join(staticDir, "index.html"), "<main>StopDown</main>", "utf8");

    const server = createServer(async (request, response) => {
      if (await tryServeStaticAsset(request, response, staticDir)) {
        return;
      }

      response.writeHead(418);
      response.end();
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.notEqual(address, null);
    const baseUrl = `http://127.0.0.1:${(address as { port: number }).port}`;

    try {
      const frontendResponse = await fetch(`${baseUrl}/`);
      assert.equal(frontendResponse.status, 200);
      assert.equal(await frontendResponse.text(), "<main>StopDown</main>");
      assert.match(frontendResponse.headers.get("content-type") ?? "", /text\/html/);

      const apiResponse = await fetch(`${baseUrl}/v1/health`);
      assert.equal(apiResponse.status, 418);
    } finally {
      server.close();
      await once(server, "close");
      await rm(staticDir, { recursive: true, force: true });
    }
  });
});
