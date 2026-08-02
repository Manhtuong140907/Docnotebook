import assert from "node:assert/strict";
import test from "node:test";
import app from "../server.js";

async function withServer(run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve())
    );
  }
}

test("health endpoint returns server state", async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.aiConfigured, "boolean");
    assert.equal(typeof body.model, "string");
  });
});

test("AI endpoint rejects a request without an image", async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/api/ocr-ai`, {
      method: "POST",
      body: new FormData()
    });
    assert.ok([400, 503].includes(response.status));
    const body = await response.json();
    assert.equal(typeof body.error, "string");
  });
});
