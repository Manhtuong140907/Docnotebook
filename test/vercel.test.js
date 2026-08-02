import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import app from "../server.js";
import vercelApp from "../api/index.js";

test("Vercel entrypoint exports the Express app", () => {
  assert.equal(vercelApp, app);
});

test("Vercel configuration routes requests to the API function", async () => {
  const raw = await readFile(new URL("../vercel.json", import.meta.url), "utf8");
  const config = JSON.parse(raw);

  assert.equal(config.framework, null);
  assert.equal(config.functions["api/index.js"].maxDuration, 60);
  assert.equal(config.functions["api/index.js"].includeFiles, "public/**");
  assert.deepEqual(config.rewrites, [
    { source: "/(.*)", destination: "/api" }
  ]);
});
