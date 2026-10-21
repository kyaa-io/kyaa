import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import net from "node:net";
import https from "node:https";
import { startServer, safeFile } from "../host/server.mjs";
import { certificate } from "../host/certificate.mjs";
import { initialState } from "../host/state.mjs";
test("paired session, origin, source separation, paths and command acknowledgement", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kyaa-test-"));
  fs.writeFileSync(path.join(dir, "index.html"), "hello");
  const manifest = { cues: [{ id: "a" }, { id: "b" }] },
    state = initialState(manifest),
    tls = certificate(path.join(dir, "tls"));
  const host = await startServer({
    state,
    manifest,
    bundle: dir,
    frontend: dir,
    tls,
    validateProjection: (x) => {
      if (x.secret) throw Error("secret");
      return x;
    },
    sourceOrigin: () => "https://kyaa.io",
    setup: () => ({}),
  });
  const base = `http://127.0.0.1:${host.localPort}`;
  let ws, source, pointerClient;
  const receive = (socket, predicate) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off("message", listener);
        reject(Error("WS timeout"));
      }, 3000);
      const listener = (raw) => {
        const value = JSON.parse(raw);
        if (predicate(value)) {
          clearTimeout(timeout);
          socket.off("message", listener);
          resolve(value);
        }
      };
      socket.on("message", listener);
    });
  try {
    const secureStatus = await new Promise((resolve, reject) => {
      https
        .get(
          `https://127.0.0.1:${host.lanPort}/api/state`,
          { ca: tls.ca },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        )
        .on("error", reject);
    });
    assert.equal(secureStatus, 401);
    fs.mkdirSync(path.join(dir, "ui-assets"));
    assert.equal((await fetch(base + "/ui-assets")).status, 404);
    await new Promise((resolve) => {
      const socket = net.connect(host.localPort, "127.0.0.1", () =>
        socket.write(
          "GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
        ),
      );
      socket.on("close", resolve);
      socket.on("error", () => {});
    });
    assert.equal((await fetch(base + "/api/state")).status, 401);
    assert.equal(
      (
        await fetch(base + "/api/pair", {
          method: "POST",
          headers: { Origin: "https://evil.test" },
          body: JSON.stringify({ token: host.pairToken }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/pair", {
          method: "POST",
          body: JSON.stringify({ token: host.sourceToken }),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(base + "/api/pair", {
          method: "POST",
          body: JSON.stringify({ token: "가".repeat(64) }),
        })
      ).status,
      401,
    );
    const paired = await fetch(base + "/api/pair", {
      method: "POST",
      body: JSON.stringify({ token: host.pairToken }),
    });
    assert.equal(paired.status, 200);
    const cookie = paired.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (await fetch(base + "/api/state", { headers: { Cookie: cookie } }))
        .status,
      200,
    );
    assert.throws(() => safeFile(dir, "../no"));
    fs.symlinkSync("/etc/hosts", path.join(dir, "escape"));
    assert.throws(() => safeFile(dir, "escape"));
    ws = new WebSocket(base.replace("http", "ws") + "/ws", {
      headers: { Cookie: cookie, Origin: base },
    });
    const messages = [];
    ws.on("message", (raw) => messages.push(JSON.parse(raw)));
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    const ack = new Promise((resolve) =>
      ws.on("message", (raw) => {
        const m = JSON.parse(raw);
        if (m.type === "ack") resolve(m);
      }),
    );
    ws.send(
      JSON.stringify({ type: "command", id: "1", revision: 0, action: "next" }),
    );
    assert.equal((await ack).ok, true);
    assert.equal(state.cueId, "b");
    state.scope = "event-day";
    source = new WebSocket(
      base.replace("http", "ws") + "/source?token=" + host.sourceToken,
      { headers: { Origin: "https://kyaa.io" } },
    );
    const initialScope = await receive(
      source,
      (m) => m.type === "source-command",
    );
    assert.equal(initialScope.scope, "event-day");
    const resync = receive(source, (m) => m.type === "source-command");
    source.send(
      JSON.stringify({ type: "projection", projection: { scope: "all" } }),
    );
    await resync;
    assert.equal(state.sourceUpdatedAt, null);
    const projected = receive(
      ws,
      (m) => m.type === "state" && m.state.projection?.scope === "event-day",
    );
    source.send(
      JSON.stringify({
        type: "projection",
        projection: { scope: "event-day" },
      }),
    );
    await projected;
    assert(state.sourceUpdatedAt);
    pointerClient = new WebSocket(base.replace("http", "ws") + "/ws", {
      headers: { Cookie: cookie, Origin: base },
    });
    await new Promise((resolve) => pointerClient.once("open", resolve));
    const visible = receive(ws, (m) => m.type === "pointer" && m.visible);
    pointerClient.send(
      JSON.stringify({
        type: "command",
        id: "pointer1",
        revision: state.revision,
        action: "pointer",
        x: 0.5,
        y: 0.5,
        visible: true,
      }),
    );
    await visible;
    const hidden = receive(ws, (m) => m.type === "pointer" && !m.visible);
    pointerClient.close();
    await hidden;
  } finally {
    ws?.terminate();
    source?.terminate();
    pointerClient?.terminate();
    host.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
