// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearResources, installResourceWriteWatch, syncResourceOwner } from "@/components/fan-ui/resource-cache";
import { DukjilProvider, resetDukjilCatalogCache } from "./dukjil-provider";
import { FanMissions } from "./fan-missions";

// 261107-2 D6: the real request hook and store (no mock of use-group-resource). A mission write made with a plain fetch (the post
// composer and the comment form) must move the mounted mission rows without leaving or reloading the screen.
vi.mock("@/features/auth/client/cognito-auth", () => {
  const getAccessToken = async () => "token";
  return { useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: "fan" }, getAccessToken }) };
});
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "fan", generation: 1, error: null }) }));
vi.mock("@/components/locale-provider", () => ({ useAppLocale: () => ({ locale: "ko" }) }));

const rules = { checkin: { points: 2 }, post: { points: 20, dailyLimit: 3 }, comment: { points: 3, dailyLimit: 10 }, share: { points: 10, dailyLimit: 3 } };
const server = { post: 0, comment: 0, share: 0, todayReads: 0 };
const item = (count: number, limit: number) => ({ count, points: count * 10, remaining: limit - count, stamped: count > 0 });
let uninstall = () => {};

beforeEach(() => {
  Object.assign(server, { post: 0, comment: 0, share: 0, todayReads: 0 });
  resetDukjilCatalogCache(); syncResourceOwner("fan:1"); clearResources();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    if (url.startsWith("/api/dukjil/catalog")) return Response.json({ version: 3, rules, missionBook: {} });
    if (url.startsWith("/api/me/dukjil/today")) {
      server.todayReads += 1;
      return Response.json({ kstDate: "2026-11-08", policyActive: true, totalPoints: 0, hasPassport: true, attendance: { attendedToday: false, streak: 0, nextBonusIn: 7 },
        actions: { post: item(server.post, 3), comment: item(server.comment, 10), share: item(server.share, 3) } });
    }
    if (method === "POST" && url.includes("/comments")) { server.comment += 1; return Response.json({ id: "00000000-0000-4000-8000-000000000002", revision: 1, replayed: false }, { status: 201 }); }
    if (method === "POST" && url.includes("/posts")) { server.post += 1; return Response.json({ id: "00000000-0000-4000-8000-000000000001", revision: 1, replayed: false, reward: { points: 20, stamps: 1 } }, { status: 201 }); }
    if (method === "POST" && url.includes("/share-proofs")) { server.share += 1; return Response.json({ state: "accepted" }, { status: 201 }); }
    return Response.json({});
  }));
  uninstall = installResourceWriteWatch();
});
afterEach(() => { uninstall(); cleanup(); vi.unstubAllGlobals(); });

const ui = () => render(<DukjilProvider slug="elina" locale="ko"><FanMissions locale="ko" slug="elina" title="팬 활동" passportHref="/passports/p?locale=ko" proofHref="/elina?tab=certifications&locale=ko" onAttendance={() => {}} /></DukjilProvider>);
const count = (key: string) => document.querySelector(`li[data-mission="${key}"] [role=progressbar]`)?.getAttribute("aria-valuenow");

it.each([
  ["post", "/api/celebrities/elina/posts"],
  ["comment", "/api/posts/00000000-0000-4000-8000-000000000009/comments"],
  ["share", "/api/me/share-proofs"],
])("moves the %s row right after the write answers, on the same screen", async (key, path) => {
  ui();
  await waitFor(() => expect(count(key)).toBe("0"));
  const before = server.todayReads;
  await act(async () => { await window.fetch(path, { method: "POST", body: "{}" }); });
  await waitFor(() => expect(count(key)).toBe("1"));
  expect(server.todayReads).toBe(before + 1);
});
