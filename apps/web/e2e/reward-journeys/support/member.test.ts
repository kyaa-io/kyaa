import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accountDir = vi.hoisted(() => `${process.env.TMPDIR ?? "/tmp"}/kyaa-member-call-${process.pid}`);
vi.mock("./env", () => ({ ACCOUNT_DIR: accountDir, APP_PORT: "3002", BASE_URL: "http://localhost:3002" }));
vi.mock("./db", () => ({ appUserIdByEmail: () => "app-user-fixture", balances: vi.fn(), count: vi.fn(), exec: vi.fn(), resetMember: vi.fn(), scalar: vi.fn() }));

import { Member } from "./member";

const FAN_COOKIE = "__Host-kyaa-fan-session=sealed-fixture";
const farFuture = () => Date.now() / 1000 + 3600;
const jwt = (exp: number) => `e30.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;

function member(state: { fan?: boolean; privy?: string }): Member {
  fs.writeFileSync(path.join(accountDir, "accounts.json"), JSON.stringify({ fixture: { email: "fixture@example.test" } }));
  const file = path.join(accountDir, "fixture.json");
  fs.writeFileSync(file, JSON.stringify({
    cookies: state.fan ? [{ name: "__Host-kyaa-fan-session", value: "sealed-fixture", domain: "localhost", expires: farFuture() }] : [],
    origins: [{ localStorage: state.privy ? [{ name: "privy:token", value: JSON.stringify(state.privy) }] : [] }],
  }));
  return new Member("fixture", file);
}

describe("Member.call credentials", () => {
  const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => Response.json({ ok: true }));
  beforeEach(() => { fs.mkdirSync(accountDir, { recursive: true }); fetcher.mockClear(); vi.stubGlobal("fetch", fetcher); });
  afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(accountDir, { recursive: true, force: true }); });

  const sent = () => (fetcher.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;

  it("sends our own session cookie with the kyaa-session bearer when there is no Privy token", async () => {
    await member({ fan: true }).call("GET", "/api/me");
    expect(fetcher.mock.calls[0][0]).toBe("http://localhost:3002/api/me");
    expect(sent()).toMatchObject({ authorization: "Bearer kyaa-session", cookie: FAN_COOKIE });
  });
  it("picks our own session cookie over an expired Privy token", async () => {
    await member({ fan: true, privy: jwt(1) }).call("POST", "/api/me", { a: 1 });
    expect(sent()).toMatchObject({ authorization: "Bearer kyaa-session", cookie: FAN_COOKIE, "content-type": "application/json" });
  });
  it("keeps the Privy bearer without a cookie when only Privy is stored", async () => {
    const token = jwt(Date.now() / 1000 + 3600);
    await member({ privy: token }).call("GET", "/api/me");
    expect(sent()).toEqual({ authorization: `Bearer ${token}` });
  });
});
