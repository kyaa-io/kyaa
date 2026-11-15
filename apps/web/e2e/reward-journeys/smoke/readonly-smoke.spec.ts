import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { guardWrites, type WriteGuard } from "./guard";

// Read-only smoke for a deployed site, run right after a release. No business write is sent: every same-origin request that is not
// GET/HEAD/OPTIONS is aborted in the browser unless it is the analytics beacon (an analytics write, so this is "no business write", not "zero writes"), and any aborted attempt fails the test.
// Guest checks always run. Member checks run when SMOKE_STORAGE_STATE points at a test account's browser storage state.

const BASE_URL = (process.env.SMOKE_BASE_URL ?? "").replace(/\/$/, "");
const STORAGE_STATE = process.env.SMOKE_STORAGE_STATE;
const NAVIGATION_BUDGET_MS = Number(process.env.SMOKE_NAVIGATION_BUDGET_MS ?? 30_000);

test.skip(!BASE_URL, "SMOKE_BASE_URL is required");

const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

async function open(page: Page, path: string) {
  const started = Date.now();
  const response = await page.goto(`${BASE_URL}${path}${path.includes("?") ? "&" : "?"}locale=ko`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  expect(response?.status(), path).toBe(200);
  return { ms: () => Date.now() - started };
}

function token(): string {
  const state = JSON.parse(fs.readFileSync(STORAGE_STATE!, "utf8")) as { origins?: { localStorage?: { name: string; value: string }[] }[] };
  for (const origin of state.origins ?? []) for (const item of origin.localStorage ?? []) if (item.name === "privy:token") return JSON.parse(item.value) as string;
  throw new Error("SMOKE_STORAGE_STATE has no privy:token");
}

test.describe("@smoke guest", () => {
  let guard: WriteGuard;
  let pageErrors: string[];
  test.beforeEach(async ({ page, context }) => {
    pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    guard = await guardWrites(context, BASE_URL);
  });
  test.afterEach(() => {
    expect(guard.blocked, "no business write may leave the page").toEqual([]);
    if (guard.externalAborted.length) test.info().annotations.push({ type: "external-writes-aborted", description: guard.externalAborted.join(", ") });
    expect(pageErrors).toEqual([]);
  });

  test("health, home, notices, dukjil guide, lucky draw preview", async ({ page, request }) => {
    expect((await request.get(`${BASE_URL}/api/health/live`)).status()).toBe(200);

    const home = await open(page, "/");
    await expect(page.locator("h1").first()).toBeVisible();
    expect(home.ms()).toBeLessThan(NAVIGATION_BUDGET_MS);

    await open(page, "/notices");
    await expect(page.getByRole("heading", { level: 1, name: "공지사항" })).toBeVisible();
    await expect(page.locator("a[href^='/notices/']").first()).toBeVisible();

    await open(page, "/guide/dukjil");
    await expect(page.getByRole("heading", { level: 1, name: "덕질하는 법" })).toBeVisible();

    // The 덕질 screen: lucky draw area and the wallet shell are on screen without a login.
    const benefits = await open(page, "/benefits");
    await expect(page.getByRole("heading", { level: 1, name: "덕질" })).toBeVisible();
    await expect(page.getByText("지난 럭키드로우").first()).toBeVisible({ timeout: 30_000 });
    expect(benefits.ms(), "덕질 screen load time").toBeLessThan(NAVIGATION_BUDGET_MS);
  });
});

test.describe("@smoke member", () => {
  test.skip(!STORAGE_STATE, "SMOKE_STORAGE_STATE is not set; member checks are skipped");
  test.use({ storageState: STORAGE_STATE });
  let guard: WriteGuard;
  let pageErrors: string[];
  test.beforeEach(async ({ page, context }) => {
    pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    guard = await guardWrites(context, BASE_URL);
  });
  test.afterEach(() => {
    expect(guard.blocked, "no business write may leave the page").toEqual([]);
    if (guard.externalAborted.length) test.info().annotations.push({ type: "external-writes-aborted", description: guard.externalAborted.join(", ") });
    expect(pageErrors).toEqual([]);
  });

  test("wallet numbers on the API match the wallet and 덕질 screens", async ({ page }) => {
    const headers = { authorization: `Bearer ${token()}` };
    const wallet = await page.request.get(`${BASE_URL}/api/me/wallet`, { headers });
    expect(wallet.status()).toBe(200);
    const { points, tickets, pointCost, policyVersion } = (await wallet.json()) as { points: number; tickets: number; pointCost: number; policyVersion: string };
    expect(Number.isInteger(points) && points >= 0).toBe(true);
    expect(Number.isInteger(tickets) && tickets >= 0).toBe(true);
    expect([pointCost, policyVersion]).toEqual([100, "group-wallet-v1"]);

    const today = await page.request.get(`${BASE_URL}/api/me/dukjil/today`, { headers });
    expect(today.status()).toBe(200);
    expect(await today.json()).toMatchObject({ kstDate: kstToday(), policyActive: true });

    const fmt = (n: number) => n.toLocaleString("en-US");
    await open(page, "/my/wallet");
    // Label and number are separate elements, so match on the page text, not on one element.
    const body = page.locator("body");
    await expect(body).toContainText(new RegExp(`포인트\\s*${fmt(points)}\\s*P`), { timeout: 30_000 });
    await expect(body).toContainText(new RegExp(`응모권\\s*${fmt(tickets)}\\s*장`));

    await open(page, "/benefits");
    await expect(body).toContainText(new RegExp(`포인트\\s*${fmt(points)}\\s*P`), { timeout: 30_000 });
    await expect(body).toContainText(/스탬프\s*\d+\s*\/\s*9/);
    await expect(body).toContainText("오늘의 덕질");
  });

  test("passport screen lists the member's passport", async ({ page }) => {
    await open(page, "/passports");
    await expect(page.getByRole("heading", { level: 1, name: "내 패스포트" })).toBeVisible();
    await expect(page.locator("body")).toContainText(/\d+\s*\/\s*9/, { timeout: 30_000 });
  });
});
