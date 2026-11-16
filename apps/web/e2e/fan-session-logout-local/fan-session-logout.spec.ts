import { createServer, type Server } from "node:http";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Real Chromium, real cookie jar, real route/gate code. Only the Privy proof and the member table are stand-ins.
const COOKIE = "__Host-kyaa-fan-session";
const PID = "did:privy:logout-local";
const UID = "22222222-2222-4222-8222-222222222222";

let server: Server;
let origin = "";
let clientJs = "";
let deletes = 0;
let resetUser = () => undefined as void;

test.beforeAll(async () => {
  // `server-only` throws outside React's server build; the route code is imported as plain Node here.
  const load = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
  (Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, ...rest: unknown[]) {
    return request === "server-only" ? {} : load.call(this, request, ...rest);
  };
  process.env.AUTH_COOKIE_SECRET = Buffer.alloc(32, 5).toString("base64");
  delete process.env.APPLE_LIFECYCLE_ENABLED;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createFanSessionRoute } = require("../../server/auth/fan-session-route");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fanSessionKey } = require("../../server/auth/fan-session-cookie");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPrivyNodeAccessVerifier } = require("../../server/auth/privy-node-verifier");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { authorizeFanRequest } = require("../../server/fan-auth/fan-auth-gate");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ts = require("typescript");
  clientJs = ts.transpileModule(readFileSync(join(__dirname, "../../features/auth/client/fan-session.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;

  const key = fanSessionKey(process.env.AUTH_COOKIE_SECRET);
  const user = { id: UID, privyUserId: PID, verifiedEmail: "fan@example.com", status: "active" as const, sessionsValidAfter: null as string | null };
  resetUser = () => { user.sessionsValidAfter = null; };
  const repository = { findUserByPrivyId: async () => user };
  const privy = { utils: () => ({ auth: () => ({ verifyAccessToken: async () => ({}) }) }), users: () => ({ _get: async () => ({}) }) };
  const verifierFor = (cookie: string | null) => createPrivyNodeAccessVerifier({ appId: "app-1", appSecret: "secret", appleLoginEnabled: false }, privy, { sessionKey: key, readCookieHeader: async () => cookie });

  await new Promise<void>((resolve) => { server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", origin || "http://127.0.0.1");
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers(); for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
    const send = async (response: Response) => {
      const out: Record<string, string | string[]> = {};
      response.headers.forEach((value, name) => { if (name !== "set-cookie") out[name] = value; });
      const cookies = response.headers.getSetCookie(); if (cookies.length) out["set-cookie"] = cookies;
      res.writeHead(response.status, out); res.end(Buffer.from(await response.arrayBuffer()));
    };
    if (url.pathname === "/") return void res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>logout</title><script type="module">import * as fs from "/fan-session.js"; window.fs = fs; window.ready = true;</script>`);
    if (url.pathname === "/fan-session.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(clientJs);
    if (url.pathname === "/api/protected") {
      try { await authorizeFanRequest({ authorization: headers.get("authorization"), verifier: verifierFor(headers.get("cookie")), repository }); return void res.writeHead(200).end("ok"); }
      catch { return void res.writeHead(401).end("no"); }
    }
    if (url.pathname === "/api/auth/fan-session") {
      if (req.method === "DELETE") deletes += 1;
      const route = createFanSessionRoute({
        appOrigin: origin, key, resolve: async () => ({ privyUserId: PID, sessionId: "s1", tokenIssuedAt: Date.now() - 1000,
          identity: { privyUserId: PID, verifiedEmail: "fan@example.com", providerAccounts: [], googleLinked: false }, apple: null, google: null }),
        verifyCookie: () => verifierFor(headers.get("cookie")).verify("kyaa-session"),
        isPrivileged: async () => false, repository,
        revokeSessions: async (_id: string, at: string) => { user.sessionsValidAfter = at; },
      });
      const request = new Request(origin + url.pathname, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : Buffer.concat(chunks) });
      return send(await (req.method === "DELETE" ? route.DELETE(request) : route.POST(request)));
    }
    res.writeHead(404).end();
  }); server.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(() => { server.close(); });
test.beforeEach(() => { deletes = 0; resetUser(); });

async function signedInPage(page: Page) {
  await page.goto(origin + "/");
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
  await page.evaluate((pid) => (window as any).fs.renewFanSession(async () => "privy-token", pid), PID);
  const cookie = (await page.context().cookies()).find((item) => item.name === COOKIE);
  expect(cookie, "the first exchange issues the cookie").toBeTruthy();
  expect(await protectedStatus(page)).toBe(200);
  return `${COOKIE}=${cookie!.value}`;
}
const protectedStatus = (page: Page, cookie?: string) => cookie
  ? page.request.get(origin + "/api/protected", { headers: { authorization: "Bearer kyaa-session", cookie } }).then((response) => response.status())
  : page.evaluate(() => fetch("/api/protected", { headers: { authorization: "Bearer kyaa-session" } }).then((response) => response.status));
const hint = (page: Page) => page.evaluate(() => localStorage.getItem("kyaa:fan-session"));
const sessionCookies = async (page: Page) => (await page.context().cookies()).filter((item) => item.name === COOKIE && item.value !== "");

test("a renewal answer that arrives after sign-out does not bring the session back", async ({ page }) => {
  const copied = await signedInPage(page);
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  let reachedServer!: () => void; const serverAnswered = new Promise<void>((resolve) => { reachedServer = resolve; });
  let lateOutcome = "not delivered";
  await page.route("**/api/auth/fan-session", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const response = await route.fetch(); // the server has processed the renewal and reissued the cookie
    expect(response.headers()["set-cookie"]).toContain(COOKIE);
    reachedServer(); await held;
    try { await route.fulfill({ response }); lateOutcome = "delivered"; } catch { lateOutcome = "dropped"; }
  });
  await page.evaluate((pid) => { (window as any).renewal = (window as any).fs.renewFanSession(async () => "privy-token", pid); }, PID);
  await serverAnswered;

  await page.evaluate(() => (window as any).fs.clearFanSession());
  release();
  await expect.poll(() => lateOutcome).not.toBe("not delivered");
  await page.evaluate(() => (window as any).renewal);

  expect(deletes).toBe(1);
  expect(await sessionCookies(page)).toEqual([]);
  expect(await hint(page)).toBeNull();
  expect(await protectedStatus(page)).toBe(401);
  expect(await protectedStatus(page, copied), "a copy of the cookie is refused too").toBe(401);
});

test("sign-out finishes while the renewal request never gets a response", async ({ page }) => {
  const copied = await signedInPage(page);
  let forwarded = false;
  await page.route("**/api/auth/fan-session", async (route) => {
    if (route.request().method() === "POST") { forwarded = true; return; } // neither forwarded nor answered
    return route.fallback();
  });
  await page.evaluate((pid) => { (window as any).renewal = (window as any).fs.renewFanSession(async () => "privy-token", pid); }, PID);
  await expect.poll(() => forwarded).toBe(true);

  const started = Date.now();
  await page.evaluate(() => (window as any).fs.clearFanSession());
  expect(Date.now() - started, "does not wait for the stuck request").toBeLessThan(5000);
  await page.evaluate(() => (window as any).renewal);
  expect(deletes).toBe(1);
  expect(await sessionCookies(page)).toEqual([]);
  expect(await hint(page)).toBeNull();
  expect(await protectedStatus(page, copied)).toBe(401);
});

test("a renewal that never answers is aborted after the time limit and keeps the session", async ({ page }) => {
  await signedInPage(page);
  await page.evaluate(() => {
    const original = window.fetch.bind(window); const signals: AbortSignal[] = [];
    (window as any).signals = signals;
    window.fetch = (input, init) => { if (init?.signal) signals.push(init.signal); return original(input, init); };
  });
  await page.route("**/api/auth/fan-session", async (route) => { if (route.request().method() === "POST") return; return route.fallback(); });
  const started = Date.now();
  await page.evaluate((pid) => (window as any).fs.renewFanSession(async () => null, pid), PID);
  expect(Date.now() - started).toBeGreaterThanOrEqual(9_500);
  expect(await page.evaluate(() => (window as any).signals.map((signal: AbortSignal) => signal.aborted))).toEqual([true]);
  expect(await hint(page)).not.toBeNull();
  expect(await sessionCookies(page)).toHaveLength(1);
});
