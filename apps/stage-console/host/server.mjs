import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";
import { createReducer } from "./state.mjs";
export function safeFile(root, name) {
  const file = path.resolve(root, name);
  if (!file.startsWith(path.resolve(root) + path.sep))
    throw Error("invalid path");
  const real = fs.realpathSync(file);
  if (!real.startsWith(fs.realpathSync(root) + path.sep))
    throw Error("invalid path");
  return real;
}
export async function startServer({
  state,
  manifest,
  bundle,
  frontend,
  tls,
  validateProjection,
  onEffect,
  onChange,
  setup,
  sourceOrigin,
}) {
  const pairToken = crypto.randomBytes(32).toString("hex"),
    sourceToken = crypto.randomBytes(32).toString("hex");
  const sessions = new Set(),
    clients = new Set();
  let source = null,
    pointerTimer,
    pointerOwner;
  const reduce = createReducer(manifest, state);
  const send = (ws, data) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(data));
  };
  const broadcast = (data) => clients.forEach((ws) => send(ws, data));
  const publish = () => {
    broadcast({ type: "state", state });
    onChange?.();
  };
  const authenticated = (req) =>
    sessions.has(
      /(?:^|; )stage=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || "")?.[1],
    );
  const snapshot = () => ({ state, manifest });
  const handler = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const url = new URL(req.url, "http://localhost");
    const json = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    const local =
      req.socket.localAddress === "127.0.0.1" && !req.socket.encrypted;
    const expected = `${req.socket.encrypted ? "https" : "http"}://${req.headers.host}`;
    if (req.headers.origin && req.headers.origin !== expected)
      return json(403, { error: "origin" });
    if (url.pathname === "/api/pair" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1024) return json(413, {});
      }
      let token;
      try {
        token = JSON.parse(body).token;
      } catch {
        return json(400, {});
      }
      if (
        typeof token !== "string" ||
        !/^[a-f0-9]{64}$/.test(token) ||
        !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(pairToken))
      )
        return json(401, {});
      const session = crypto.randomBytes(32).toString("hex");
      sessions.add(session);
      res.setHeader(
        "Set-Cookie",
        `stage=${session}; HttpOnly; SameSite=Strict; Path=/${local ? "" : "; Secure"}`,
      );
      return json(200, { ok: true });
    }
    if (url.pathname === "/certificate.cer") {
      res.writeHead(200, { "Content-Type": "application/x-x509-ca-cert" });
      return fs.createReadStream(tls.caPath).pipe(res);
    }
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/assets/")
    ) {
      if (!authenticated(req)) return json(401, {});
      if (url.pathname === "/api/state") return json(200, snapshot());
      if (url.pathname === "/api/setup") return json(200, setup());
    }
    try {
      const isAsset = url.pathname.startsWith("/assets/");
      const name = decodeURIComponent(
        isAsset
          ? url.pathname.slice(8)
          : url.pathname === "/"
            ? "index.html"
            : url.pathname.slice(1),
      );
      const file = safeFile(isAsset ? bundle : frontend, name);
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".mp4": "video/mp4",
        ".svg": "image/svg+xml",
        ".json": "application/json",
      };
      const stat = fs.statSync(file);
      if (!stat.isFile()) return json(404, {});
      const size = stat.size;
      let start = 0,
        end = size - 1,
        status = 200;
      if (req.headers.range) {
        const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if (!m) return json(416, {});
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), size - 1) : end;
        if (start > end || start >= size) return json(416, {});
        status = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      }
      res.writeHead(status, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(file, { start, end })
        .on("error", () => res.destroy())
        .pipe(res);
    } catch {
      json(404, { error: "not found" });
    }
  };
  const guarded = (req, res) => {
    Promise.resolve(handler(req, res)).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  };
  const local = http.createServer(guarded),
    lan = https.createServer(tls, guarded);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
  const upgrade = (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    const isSource =
      url.pathname === "/source" &&
      !req.socket.encrypted &&
      req.socket.localAddress === "127.0.0.1";
    const origin = req.headers.origin;
    const validSource =
      isSource &&
      url.searchParams.get("token") === sourceToken &&
      origin === sourceOrigin();
    const validClient =
      url.pathname === "/ws" &&
      authenticated(req) &&
      origin ===
        `${req.socket.encrypted ? "https" : "http"}://${req.headers.host}`;
    if (!validSource && !validClient) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (validSource) {
        source?.close();
        source = ws;
        state.sourceConnected = true;
        send(ws, {
          type: "source-command",
          action: "scope",
          scope: state.scope,
        });
        publish();
      } else {
        clients.add(ws);
        state.connections = clients.size;
        send(ws, { type: "snapshot", ...snapshot() });
        publish();
      }
      ws.on("message", (raw) => {
        try {
          const data = JSON.parse(raw);
          if (validSource) {
            if (source !== ws || data.type !== "projection")
              throw Error("invalid source");
            const projection = validateProjection(data.projection);
            if (projection.scope !== state.scope) {
              send(ws, {
                type: "source-command",
                action: "scope",
                scope: state.scope,
              });
              return;
            }
            state.projection = projection;
            state.sourceUpdatedAt = Date.now();
            publish();
            return;
          }
          const effect = reduce(data);
          if (!effect.duplicate) {
            if (effect.action === "pointer") {
              pointerOwner = ws;
              clearTimeout(pointerTimer);
              broadcast({ type: "pointer", ...effect });
              if (effect.visible)
                pointerTimer = setTimeout(
                  () =>
                    broadcast({ type: "pointer", x: 0, y: 0, visible: false }),
                  2000,
                );
            }
            if (effect.action === "media")
              broadcast({
                type: "media-command",
                cueId: state.cueId,
                operation: effect.operation,
              });
            if (["scope", "refresh"].includes(effect.action) && source)
              send(source, {
                type: "source-command",
                action: effect.action,
                ...(effect.action === "scope" ? { scope: state.scope } : {}),
              });
            onEffect?.(effect);
            publish();
          }
          send(ws, { type: "ack", id: data.id, ok: true });
        } catch (e) {
          let id;
          try {
            id = JSON.parse(raw).id;
          } catch {}
          send(ws, { type: "ack", id, ok: false, error: e.message });
        }
      });
      ws.alive = true;
      ws.on("pong", () => {
        ws.alive = true;
      });
      ws.on("error", () => {});
      ws.on("close", () => {
        if (pointerOwner === ws) {
          clearTimeout(pointerTimer);
          broadcast({ type: "pointer", x: 0, y: 0, visible: false });
          pointerOwner = null;
        }
        clients.delete(ws);
        if (source === ws) {
          source = null;
          state.sourceConnected = false;
        }
        state.connections = clients.size;
        publish();
      });
    });
  };
  const guardedUpgrade = (req, socket, head) => {
    try {
      upgrade(req, socket, head);
    } catch {
      socket.destroy();
    }
  };
  local.on("upgrade", guardedUpgrade);
  lan.on("upgrade", guardedUpgrade);
  await new Promise((r) => local.listen(0, "127.0.0.1", r));
  await new Promise((r) => lan.listen(0, "0.0.0.0", r));
  const heartbeat = setInterval(() => {
    for (const ws of [...clients, ...(source ? [source] : [])]) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }, 10000);
  return {
    localPort: local.address().port,
    lanPort: lan.address().port,
    pairToken,
    sourceToken,
    publish,
    broadcast,
    close: () => {
      clearInterval(heartbeat);
      clearTimeout(pointerTimer);
      clients.forEach((w) => w.close());
      source?.close();
      local.close();
      lan.close();
    },
    lan,
  };
}
