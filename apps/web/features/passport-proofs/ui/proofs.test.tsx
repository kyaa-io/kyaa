// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { failureFromCode } from "./proof-api";
import { averageHash, fitSize, rectFromPoints } from "./proof-image";
import { proofsSource } from "./proofs-source";
import { proofsText } from "./proofs-copy";
import { JjinfanTitle, ProofBoardList, ProofHistory, ProofsScreen } from "./proofs-screen";
import { APP_LOCALES } from "@/i18n/locales";

afterEach(cleanup);

const item = (over: Record<string, unknown>) => ({
  submissionId: "11111111-1111-4111-8111-111111111111", proofType: "receipt", status: "pending", revision: 1,
  reason: null, publishConsent: false, amountVisible: null, submittedAt: "2026-11-01T00:00:00Z", reviewedAt: null, ...over,
}) as never;

describe("proof image helpers", () => {
  it("makes a 16-char lowercase hex average hash", () => {
    const hash = averageHash(Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0)));
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hash).toBe("5555555555555555");
  });
  it("fits within the max edge without enlarging", () => {
    expect(fitSize(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitSize(400, 300)).toEqual({ width: 400, height: 300 });
  });
  it("normalises drag direction", () => {
    expect(rectFromPoints({ x: 0.6, y: 0.7 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, w: expect.closeTo(0.4), h: expect.closeTo(0.6) });
  });
});

describe("proof errors", () => {
  it("maps API codes to user-facing failures", () => {
    expect(failureFromCode(422, "PROOF_PII_DETECTED")).toBe("pii");
    expect(failureFromCode(429, "PROOF_MONTHLY_LIMIT")).toBe("limit");
    expect(failureFromCode(410, "UPLOAD_EXPIRED")).toBe("expired");
    expect(failureFromCode(409, "PROOF_ALREADY_OPEN")).toBe("open");
    expect(failureFromCode(400, "INVALID_IMAGE")).toBe("upload");
    expect(failureFromCode(401, undefined)).toBe("auth");
    expect(failureFromCode(500, undefined)).toBe("generic");
  });
});

describe("proof copy", () => {
  it("has every key in all 12 locales", () => {
    for (const locale of APP_LOCALES) for (const key of Object.keys(proofsSource) as (keyof typeof proofsSource)[]) {
      expect(proofsText(locale, key, [3]).length, `${locale}:${key}`).toBeGreaterThan(0);
    }
    expect(proofsText("ja", "pfSubmit")).not.toBe(proofsText("en", "pfSubmit"));
  });
});

describe("proof screens", () => {
  it("shows the reason and a resubmit action only for changes_requested", () => {
    render(<ProofHistory locale="ko" onResubmit={() => {}} items={[item({ status: "changes_requested", reason: "금액이 가려졌어요" }), item({ submissionId: "22222222-2222-4222-8222-222222222222", status: "rejected", reason: "다른 사람의 영수증" })]} />);
    expect(screen.getByText("금액이 가려졌어요")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "다시 제출" })).toHaveLength(1);
  });
  it("renders empty states and the board text", () => {
    const { rerender } = render(<ProofHistory locale="ko" items={[]} onResubmit={() => {}} />);
    expect(screen.getByText("제출 내역이 없어요")).toBeTruthy();
    rerender(<ProofBoardList locale="ko" items={[]} />);
    expect(screen.getByText("아직 올라온 인증이 없어요")).toBeTruthy();
    rerender(<ProofBoardList locale="ko" items={[{ postId: "33333333-3333-4333-8333-333333333333", body: "인증했어요", createdAt: "2026-11-01T00:00:00Z", proofType: "ticket", amountVisible: null, imageUrl: "/api/pages/mina/posts/33333333-3333-4333-8333-333333333333/image?t=abc", jjinfanRank: 12 }]} />);
    expect(screen.getByText("찐팬 12번째")).toBeTruthy();
    expect(screen.getByText("인증했어요", { selector: "p" })).toBeTruthy();
  });
  it("writes the true-fan title with its number", () => {
    render(<JjinfanTitle locale="ko" rank={7} />);
    expect(screen.getByText("찐팬 7번째")).toBeTruthy();
  });
});

describe("ProofsScreen mission entry", () => {
  const mission = (over: Record<string, unknown>) => ({ missionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", proofType: "ticket", platform: null, submittable: true, unavailableReason: null, closesAt: "2026-12-01T00:00:00Z", ...over });
  const stub = (missions: () => Response) => vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/missions")) return missions();
    if (url.includes("/posts")) return Response.json({ items: [], nextBefore: null });
    return Response.json({ items: [] });
  }));
  afterEach(() => vi.unstubAllGlobals());

  it("offers only the types the mission list has", async () => {
    stub(() => Response.json({ items: [mission({}), mission({ missionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", proofType: "receipt" })] }));
    render(<ProofsScreen locale="ko" slug="mina" />);
    expect(await screen.findByRole("radio", { name: "티켓" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "영수증" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "펀딩" })).toBeNull();
  });
  it("shows the existing error text and disables submit when the mission is not submittable", async () => {
    stub(() => Response.json({ items: [mission({ submittable: false, unavailableReason: "PROOF_MONTHLY_LIMIT" })] }));
    render(<ProofsScreen locale="ko" slug="mina" />);
    expect(await screen.findByText("이번 달 제출 한도에 도달했어요")).toBeTruthy();
    expect((screen.getByRole("button", { name: "제출" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("shows the empty, login and error states", async () => {
    stub(() => Response.json({ items: [] }));
    const first = render(<ProofsScreen locale="ko" slug="mina" />);
    expect(await screen.findByText("지금 제출할 수 있는 인증이 없어요")).toBeTruthy();
    first.unmount();
    stub(() => Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }));
    const second = render(<ProofsScreen locale="ko" slug="mina" />);
    const login = await screen.findByRole("link", { name: "로그인" });
    const href = new URL(login.getAttribute("href")!, "https://app.test");
    expect(href.pathname).toBe("/login");
    expect(href.searchParams.get("returnTo")).toContain("/c/mina/proofs");
    second.unmount();
    stub(() => new Response("{}", { status: 500 }));
    render(<ProofsScreen locale="ko" slug="mina" />);
    expect((await screen.findAllByText("불러오지 못했어요")).length).toBeGreaterThan(0);
  });
});
