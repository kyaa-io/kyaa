// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: false, getAccessToken: async () => null, user: null }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 1, ownerId: "owner" }) }));
vi.mock("@/components/locale-provider", () => ({ useAppLocale: () => ({ locale: "ko" }) }));
vi.mock("@/features/dukjil/ui/dukjil-provider", () => ({ useDukjil: () => ({ status: "on" }) }));
// 대표 11/11: a heart claim runs behind the rewarded ad. The ad step is stubbed here (granted unless a test says otherwise); rewarded-session.test.ts covers it.
const adRun = vi.hoisted(() => ({ outcome: "granted" as "granted" | "cancelled", paths: [] as unknown[] }));
vi.mock("@/features/group-wallet/ui/rewarded-session", () => ({ runRewardedSession: async (deps: { paths?: unknown; onGranted(id: string): void; onState(s: string): void }) => {
  adRun.paths.push(deps.paths);
  if (adRun.outcome === "granted") deps.onGranted("77777777-7777-4777-8777-777777777777"); else deps.onState("cancelled");
  return { show: () => true, cancel: () => {} };
} }));

import { PassportMissionBook } from "./passport-mission-book";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const KINDS = ["quiz", "checkin", "post", "comment", "share", "invite", "subscription", "steady_checkin", "proof"];
// Shape of the real route: kind only on page 1, no voided state, no top-level jjinfan, page.locked.
const roadmap = {
  passportId: id(1), celebrityId: id(2), hearts: 0,
  pages: [
    { pageNo: 1, slots: KINDS.map((kind, i) => ({ slotNo: i + 1, kind, state: "filled", stampId: id(10 + i), clearedAt: "2026-11-06T00:00:00Z" })), filled: 9, claimable: true, claimed: false, locked: false, lockedReason: null },
    { pageNo: 2, slots: KINDS.map((_, i) => ({ slotNo: i + 1, kind: null, state: "empty", stampId: null, clearedAt: null })), filled: 0, claimable: false, claimed: false, locked: true, lockedReason: "jjinfan_required" },
  ],
};
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

let calls: { url: string; init?: RequestInit }[];
beforeEach(() => { calls = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PassportMissionBook against the real route shapes", () => {
  it("reads the roadmap route and renders kind-less slots and the locked page", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => { calls.push({ url, init }); return json(roadmap); }));
    render(<PassportMissionBook passportId={id(1)} creatorSlug="c1" locale="ko" />);
    await screen.findAllByRole("listitem");
    expect(calls[0].url).toBe(`/api/me/passports/${id(1)}/roadmap`);
    expect(screen.getAllByRole("listitem")).toHaveLength(9);
    fireEvent.click(screen.getByRole("button", { name: "다음 쪽" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(9);
    expect(screen.getByRole("link", { name: "팬 인증 후 받기" }).getAttribute("href")).toBe("/c/c1/certifications?locale=ko");
  });

  it("posts the claim to the page route and reuses the same requestKey after a failure", async () => {
    let claimAttempts = 0;
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/claim")) { claimAttempts += 1; return claimAttempts === 1 ? json({ error: { code: "DUKJIL_UNAVAILABLE" } }, 503) : json({ hearts: 1, pageNo: 1, jjinfanConfirmed: false, cheerStampId: null, replayed: false }); }
      return json(roadmap);
    }));
    render(<PassportMissionBook passportId={id(1)} creatorSlug="c1" locale="ko" />);
    const button = await screen.findByRole("button", { name: "하트 받기" });
    fireEvent.click(button);
    await screen.findByRole("alert");
    fireEvent.click(await screen.findByRole("button", { name: "하트 받기" }));
    await waitFor(() => expect(claimAttempts).toBe(2));
    const claims = calls.filter(c => c.url.endsWith("/claim"));
    expect(claims[0].url).toBe(`/api/me/passports/${id(1)}/pages/1/claim`);
    expect(claims[0].init?.method).toBe("POST");
    const keys = claims.map(c => JSON.parse(String(c.init?.body)).requestKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(claims.map(c => JSON.parse(String(c.init?.body)).adSessionId)).toEqual(["77777777-7777-4777-8777-777777777777", "77777777-7777-4777-8777-777777777777"]);
    expect(adRun.paths.at(-1)).toEqual({ issue: `/api/me/passports/${id(1)}/pages/1/ad-session`, report: "/api/me/passports/ad-session/report" });
  });

  it("감독 11:46: an ad closed before the reward sends no claim", async () => {
    adRun.outcome = "cancelled";
    try {
      vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => { calls.push({ url, init }); return json(roadmap); }));
      render(<PassportMissionBook passportId={id(1)} creatorSlug="c1" locale="ko" />);
      fireEvent.click(await screen.findByRole("button", { name: "하트 받기" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "하트 받기" })).toBeEnabled());
      expect(calls.some(c => c.url.endsWith("/claim"))).toBe(false);
    } finally { adRun.outcome = "granted"; }
  });
});
