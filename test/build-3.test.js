import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BOOKING_STATES,
  canTransition,
  assertTransition,
} from "../src/domain/bookingStateMachine.js";
import { createRouter } from "../src/http/router.js";
import { createApp } from "../src/http/app.js";
import { DomainError } from "../src/domain/errors.js";

describe("Build 3", () => {
  it("allows every valid booking state transition", () => {
    const allowedMoves = [
      ["pending", "paid"],
      ["pending", "cancelled"],
      ["paid", "checked_in"],
      ["paid", "refunded"],
      ["paid", "cancelled"],
    ];

    for (const [from, to] of allowedMoves) {
      assert.equal(canTransition(from, to), true);
      assert.equal(assertTransition(from, to), true);
    }
  });

  it("rejects every illegal booking state transition with INVALID_TRANSITION", () => {
    const allowedSet = new Set([
      "pending->paid",
      "pending->cancelled",
      "paid->checked_in",
      "paid->refunded",
      "paid->cancelled",
    ]);

    for (const from of BOOKING_STATES) {
      for (const to of BOOKING_STATES) {
        const key = `${from}->${to}`;
        if (allowedSet.has(key)) {
          continue;
        }
        assert.equal(canTransition(from, to), false);
        assert.throws(
          () => assertTransition(from, to),
          (err) => {
            assert.ok(err instanceof DomainError);
            assert.equal(err.code, "INVALID_TRANSITION");
            return true;
          }
        );
      }
    }
  });

  it("matches HTTP methods, paths, and :params in the router", () => {
    const router = createRouter();
    const fn = () => {};
    router.get("/api/bookings/:bookingId", fn);

    const match = router.match("GET", "/api/bookings/bk-101");
    assert.ok(match);
    assert.equal(match.handler, fn);
    assert.deepEqual(match.params, { bookingId: "bk-101" });

    assert.equal(router.match("DELETE", "/api/bookings/bk-101"), null);
  });

  describe("HTTP server", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "b3-public-"));
    fs.writeFileSync(path.join(tmpDir, "info.txt"), "ok-static", "utf8");

    const app = createApp({
      publicDir: tmpDir,
      registerRoutes(router, { readJsonBody, sendJson }) {
        router.post("/api/test-json", async (req, res) => {
          const parsed = await readJsonBody(req);
          sendJson(res, 200, { ok: true, parsed });
        });
      },
    });

    after(async () => {
      await new Promise((resolve) => app.close(resolve));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns 200 {\"status\":\"ok\"} on GET /health", async () => {
      await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
      const { port } = app.address();

      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { status: "ok" });
    });

    it("returns JSON 404 for unknown /api paths and JSON 400 for bad JSON", async () => {
      const { port } = app.address();

      const r404 = await fetch(`http://127.0.0.1:${port}/api/unknown`);
      assert.equal(r404.status, 404);
      const j404 = await r404.json();
      assert.equal(typeof j404.error?.code, "string");
      assert.equal(typeof j404.error?.message, "string");

      const r400 = await fetch(`http://127.0.0.1:${port}/api/test-json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad json",
      });
      assert.equal(r400.status, 400);
      const j400 = await r400.json();
      assert.equal(typeof j400.error?.code, "string");
      assert.equal(typeof j400.error?.message, "string");
    });

    it("serves static files from public/ and blocks path traversal", async () => {
      const { port } = app.address();

      const okRes = await fetch(`http://127.0.0.1:${port}/info.txt`);
      assert.equal(okRes.status, 200);
      assert.equal(await okRes.text(), "ok-static");

      const escapeRes = await fetch(`http://127.0.0.1:${port}/../package.json`);
      assert.ok([400, 403, 404].includes(escapeRes.status));
      const errBody = await escapeRes.json();
      assert.equal(typeof errBody.error?.code, "string");
      assert.equal(typeof errBody.error?.message, "string");
    });
  });
});