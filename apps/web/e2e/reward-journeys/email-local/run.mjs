import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";

// Loopback-only browser/API fixture. Its ledger is an observable mock, not the production SQL implementation.
const cookieName = "__Host-kyaa-email";
const opaque = "local-only-opaque-cookie";
const token = "kyaa-email:local-only-access";
const requests = [];
const receipts = new Map();
let points = 0, ledgerWrites = 0;
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>local email E2E</title>"); return; }
  if (url.pathname === "/api/auth/cognito/session") {
    if (req.headers.cookie !== `${cookieName}=${opaque}` || req.headers.authorization) return json(res, 401, { error: "unauthorized" });
    return json(res, 200, { authenticated: true, walletLinked: true, userId: "local-member", accessToken: token, expiresAt: Date.now() + 600000 });
  }
  if (url.pathname === "/api/me/attendance/local-creator" && req.method === "POST") {
    if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: "unauthorized" });
    let body;
    try { body = JSON.parse(await new Promise((resolve, reject) => { let raw = ""; req.on("data", chunk => raw += chunk); req.on("end", () => resolve(raw)); req.on("error", reject); })); } catch { return json(res, 400, { error: "invalid" }); }
    if (!/^[a-f0-9-]{36}$/.test(body.requestKey ?? "")) return json(res, 400, { error: "invalid" });
    requests.push(body.requestKey);
    const prior = receipts.get(body.requestKey);
    if (prior) return json(res, 200, { ...prior, replayed: true });
    const receipt = { points: 10, streak: 1, bonusPoints: 0, stampId: "local-stamp", attendanceDate: "2026-11-13" };
    receipts.set(body.requestKey, receipt); points += receipt.points; ledgerWrites++;
    return json(res, 200, { ...receipt, replayed: false });
  }
  return json(res, 404, { error: "unknown" });
});
await new Promise(resolve => server.listen(0, "localhost", resolve));
const base = `http://localhost:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([{ name: cookieName, value: opaque, domain: "localhost", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  await page.goto(base);
  assert.equal(await page.evaluate(() => localStorage.getItem("privy:token")), null);
  const session = await page.evaluate(async () => { const response = await fetch("/api/auth/cognito/session"); return { status: response.status, body: await response.json() }; });
  assert.equal(session.status, 200);
  assert.equal(session.body.authenticated, true);
  assert.equal(session.body.accessToken, token);
  const key = crypto.randomUUID();
  const endpoint = "/api/me/attendance/local-creator";
  await page.route(`**${endpoint}`, async route => { await route.fetch(); await route.abort("connectionreset"); });
  const first = await page.evaluate(async ({ endpoint, key, token }) => {
    try { await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ requestKey: key }) }); return "answered"; }
    catch { return "lost"; }
  }, { endpoint, key, token: session.body.accessToken });
  assert.equal(first, "lost");
  assert.deepEqual({ points, ledgerWrites, receipts: receipts.size }, { points: 10, ledgerWrites: 1, receipts: 1 });
  await page.unroute(`**${endpoint}`);
  const retry = await page.evaluate(async ({ endpoint, key, token }) => {
    const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ requestKey: key }) });
    return { status: response.status, body: await response.json() };
  }, { endpoint, key, token: session.body.accessToken });
  assert.equal(retry.status, 200);
  assert.deepEqual(requests, [key, key]);
  assert.equal(retry.body.replayed, true);
  assert.equal(retry.body.points, 10);
  assert.deepEqual({ points, ledgerWrites, receipts: receipts.size }, { points: 10, ledgerWrites: 1, receipts: 1 });
  console.log("PASS cookie-only session, lost response, same requestKey retry; local mock ledger: 1 credit, 0 duplicate credits");
  await context.close();
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
