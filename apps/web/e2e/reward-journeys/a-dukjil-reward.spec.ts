import { expect, test } from "@playwright/test";
import { assertLocalOnly } from "./support/env";
import { Member, newKey } from "./support/member";

// (a) One fan action earns points and a stamp exactly once, and the numbers survive a reload.
test("@release-gate (a) attendance and cheer pay once and the totals survive a reload", async ({ page }) => {
  assertLocalOnly();
  const member = new Member("dev-fan-5");
  const { creatorSlug } = member.reset();
  const before = member.balances();
  expect(before).toEqual({ points: 0, tickets: 0 });

  const catalog = await member.call<{ rules: Record<string, { points: number }> }>("GET", "/api/dukjil/catalog");
  const attendancePoints = catalog.body.rules.checkin.points;

  const attend = await member.call<{ points: number; streak: number; replayed: boolean; stampId: string | null }>("POST", `/api/me/attendance/${creatorSlug}`, { requestKey: newKey() });
  expect(attend.status).toBe(200);
  expect(attend.body).toMatchObject({ points: attendancePoints, streak: 1, replayed: false });
  expect(attend.body.stampId).not.toBeNull();

  const cheer = await member.call<{ earned: number; stamped: boolean; replayed: boolean }>("POST", "/api/me/dukjil/cheer");
  expect(cheer.status).toBe(200);
  expect(cheer.body).toMatchObject({ earned: 0, stamped: true, replayed: false });

  expect(member.balances().points).toBe(attendancePoints);
  expect(member.stampCount()).toBe(2);
  expect(member.stampCount("daily_checkin")).toBe(1);
  expect(member.stampCount("cheer")).toBe(1);

  // Reload: the same member, fresh requests, the same numbers.
  await page.goto("about:blank");
  const wallet = await member.call<{ points: number }>("GET", "/api/me/wallet");
  expect(wallet.body.points).toBe(attendancePoints);
  const today = await member.call<{ totalPoints: number; actions: Record<string, { count: number; stamped: boolean }> }>("GET", `/api/me/dukjil/today?creator=${creatorSlug}`);
  expect(today.body.totalPoints).toBe(attendancePoints);
  expect(today.body.actions.checkin).toMatchObject({ count: 1, stamped: true });
  expect(today.body.actions.cheer).toMatchObject({ stamped: true });
});
