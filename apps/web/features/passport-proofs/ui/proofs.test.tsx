// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { failureFromCode, listMyProofs, listProofMissions, ProofRequestError, resubmitProof, submitProof, uploadProofImage } from "./proof-api";
import { averageHash, fitSize, rectFromPoints } from "./proof-image";
import { proofsSource } from "./proofs-source";
import { proofsText } from "./proofs-copy";
import { JjinfanTitle, ProofBoardList, ProofHistory, ProofsScreen } from "./proofs-screen";
import { MyProofRows, ProofMethods, ProofPhotoFeed, ProofReward, PublicProofsTab } from "./proofs-tab";
import { APP_LOCALES } from "@/i18n/locales";

const authState = vi.hoisted(() => ({ authenticated: false, user: { id: "member-a" } as { id: string } | null, getAccessToken: async () => "session-token" as string | null }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, ...authState }) }));
const query = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query.value) }));
vi.mock("@/features/content-safety/ui/content-actions", () => ({
  ContentActions: (props: { targetType: string; targetId: string; onChanged?: () => void }) => <button type="button" data-testid="content-actions" data-target={`${props.targetType}:${props.targetId}`} onClick={props.onChanged}>신고</button>,
}));

vi.mock("@/features/dukjil/ui/dukjil-provider", () => ({
  DukjilProvider: ({ children }: { children: import("react").ReactNode }) => children,
  useDukjil: () => ({ status: "on", catalog: { rules: { proof: { points: 173 }, subscription: { points: 31 } } } }),
}));
vi.mock("./proof-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./proof-image")>()),
  maskAndEncode: async () => ({ blob: new Blob(["webp"]), phash: "0123456789abcdef" }),
}));
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
  it("attaches the shared report and block actions to each board post", () => {
    const post = (postId: string) => ({ postId, body: "인증했어요", createdAt: "2026-11-01T00:00:00Z", proofType: "ticket", amountVisible: null, imageUrl: null, jjinfanRank: null });
    render(<ProofBoardList locale="ko" items={[post("33333333-3333-4333-8333-333333333333"), post("44444444-4444-4444-8444-444444444444")] as never} />);
    expect(screen.getAllByTestId("content-actions").map((node) => node.getAttribute("data-target"))).toEqual([
      "fan_post:33333333-3333-4333-8333-333333333333", "fan_post:44444444-4444-4444-8444-444444444444",
    ]);
  });
  it("hides a blocked post at once by post id even when the re-fetch never comes back", () => {
    const post = (postId: string) => ({ postId, body: `글 ${postId.slice(0, 2)}`, createdAt: "2026-11-01T00:00:00Z", proofType: "ticket", amountVisible: null, imageUrl: null, jjinfanRank: null });
    const onChanged = vi.fn();
    render(<ProofBoardList locale="ko" onChanged={onChanged} items={[post("33333333-3333-4333-8333-333333333333"), post("44444444-4444-4444-8444-444444444444")] as never} />);
    fireEvent.click(screen.getAllByTestId("content-actions")[0]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("content-actions").map((node) => node.getAttribute("data-target"))).toEqual(["fan_post:44444444-4444-4444-8444-444444444444"]);
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
  beforeEach(() => { authState.authenticated = true; });
  afterEach(() => vi.unstubAllGlobals());

  it("asks for the board with the session token and no caching when signed in, and without when not", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/posts") ? Response.json({ items: [], nextBefore: null }) : Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    authState.authenticated = true;
    const signedIn = render(<ProofsScreen locale="ko" slug="mina" />);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/posts"))).toBe(true));
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/posts")) as unknown as [string, RequestInit];
    expect(call[1]).toMatchObject({ cache: "no-store", headers: { Authorization: "Bearer session-token" } });
    signedIn.unmount(); fetchMock.mockClear(); authState.authenticated = false;
    render(<ProofsScreen locale="ko" slug="mina" />);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/posts"))).toBe(true));
    expect((fetchMock.mock.calls.find(([url]) => String(url).includes("/posts")) as unknown as [string, RequestInit?])[1]).toBeUndefined();
  });
  it("offers only the types the mission list has", async () => {
    stub(() => Response.json({ items: [mission({}), mission({ missionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", proofType: "receipt" })] }));
    render(<ProofsScreen locale="ko" slug="mina" />);
    expect(await screen.findByRole("radio", { name: "티켓" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "영수증" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "펀딩" })).toBeNull();
  });
  it("opens on the SNS post type from the passport 07 link and keeps that proof off the verified board (BUGS-261110 B6)", async () => {
    stub(() => Response.json({ items: [mission({ proofType: "membership" }), mission({ missionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", proofType: "sns_post", platform: "instagram" })] }));
    query.value = "type=sns_post&locale=ko";
    const linked = render(<ProofsScreen locale="ko" slug="mina" />);
    expect(((await screen.findByRole("radio", { name: "SNS 올리기" })) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("heading", { level: 1, name: "SNS 글 인증" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "인증했어요 게시판에 공개" })).toBeNull();
    linked.unmount();
    query.value = "";
    render(<ProofsScreen locale="ko" slug="mina" />);
    expect(((await screen.findByRole("radio", { name: "멤버십" })) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("heading", { level: 1, name: "멤버십·구매 인증" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "인증했어요 게시판에 공개" })).toBeTruthy();
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

describe("privacy cover step on the submit form (FB-N21)", () => {
  const formFetch = () => vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/missions")) return Response.json({ items: [{ missionId: "55555555-5555-4555-8555-555555555555", proofType: "receipt", platform: null, submittable: true, unavailableReason: null, closesAt: "2027-01-01T00:00:00Z" }] });
    if (url.includes("/posts")) return Response.json({ items: [], nextBefore: null });
    return Response.json({ items: [] });
  });
  it("shows the personal-data notice, then asks to confirm the covers once a picture is picked; submit stays off until both boxes are ticked", async () => {
    vi.stubGlobal("fetch", formFetch());
    Object.assign(URL, { createObjectURL: () => "blob:proof", revokeObjectURL: () => {} });
    authState.authenticated = true;
    const { container } = render(<ProofsScreen locale="ko" slug="mina" />);
    expect(await screen.findByText("이름·주소·카드번호 등 개인정보를 가려서 올려 주세요")).toBeTruthy();
    expect(screen.queryByLabelText("개인정보를 모두 가렸어요 (필수)")).toBeNull();
    const submit = () => screen.getByRole("button", { name: "제출" }) as HTMLButtonElement;
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [new File(["x"], "r.png", { type: "image/png" })] } });
    expect(container.querySelector("[data-proof-mask-frame]")).toBeTruthy();
    expect(screen.getByText("가릴 부분을 끌어서 칠하세요")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("개인정보 처리에 동의합니다 (필수)"));
    expect(submit().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("개인정보를 모두 가렸어요 (필수)"));
    expect(submit().disabled).toBe(false);
    // Another picture means the covers have to be confirmed again.
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [new File(["y"], "s.png", { type: "image/png" })] } });
    expect((screen.getByLabelText("개인정보를 모두 가렸어요 (필수)") as HTMLInputElement).checked).toBe(false);
    expect(submit().disabled).toBe(true);
  });
});

describe("a lost submit response (PROOF-RETRY-1116)", () => {
  const mission = "55555555-5555-4555-8555-555555555555";
  const ups = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"];
  const setup = (submitResponses: Array<() => Response>) => {
    let uploads = 0;
    const submits: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/uploads")) return Response.json({ uploadId: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${++uploads}` });
      if (url.includes("/missions")) return Response.json({ items: [{ missionId: mission, proofType: "receipt", platform: null, submittable: true, unavailableReason: null, closesAt: "2027-01-01T00:00:00Z" }] });
      if (url.includes("/posts")) return Response.json({ items: [], nextBefore: null });
      if (url.endsWith("/api/me/proofs") && init?.method === "POST") {
        submits.push(JSON.parse(String(init.body)));
        return (submitResponses.shift() ?? (() => { throw new Error("no response"); }))();
      }
      return Response.json({ items: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(URL, { createObjectURL: () => "blob:proof", revokeObjectURL: () => {} });
    authState.authenticated = true;
    return { submits, uploadCount: () => uploads };
  };
  const fill = async (container: HTMLElement) => {
    await screen.findByText("이름·주소·카드번호 등 개인정보를 가려서 올려 주세요");
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [new File(["x"], "a.png", { type: "image/png" }), new File(["y"], "b.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByLabelText("개인정보 처리에 동의합니다 (필수)"));
    fireEvent.click(screen.getByLabelText("개인정보를 모두 가렸어요 (필수)"));
  };
  const press = async () => {
    const button = screen.getByRole("button", { name: "제출" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect((screen.getByRole("button", { name: /제출/ }) as HTMLButtonElement).textContent).not.toBe(proofsText("ko", "pfSubmitting")));
  };
  afterEach(() => vi.unstubAllGlobals());

  it("resends with the same request key and uploads, and does not upload the pictures again", async () => {
    const seen = setup([() => { throw new TypeError("connection lost"); }, () => Response.json({ submissionId: ups[0], status: "pending", revision: 0, replayed: true })]);
    const { container } = render(<ProofsScreen locale="ko" slug="mina" />);
    await fill(container);
    await press();
    await waitFor(() => expect(seen.submits).toHaveLength(1));
    expect(seen.uploadCount()).toBe(2);
    await press();
    await waitFor(() => expect(seen.submits).toHaveLength(2));
    expect(seen.uploadCount()).toBe(2);
    expect(seen.submits[1]).toEqual(seen.submits[0]);
    expect(seen.submits[1].uploadIds).toEqual(ups);
  });
  it("replays a saved two-photo submission after its first response is lost", async () => {
    const saved = new Map<string, { submissionId: string; uploadIds: string[]; body: string }>();
    const requests: Array<Record<string, unknown>> = [];
    let uploads = 0;
    let replay: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/uploads")) return Response.json({ uploadId: ups[uploads++] });
      if (url.includes("/missions")) return Response.json({ items: [{ missionId: mission, proofType: "receipt", platform: null, submittable: true, unavailableReason: null, closesAt: "2027-01-01T00:00:00Z" }] });
      if (url.includes("/posts")) return Response.json({ items: [], nextBefore: null });
      if (url.endsWith("/api/me/proofs") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        requests.push(body);
        const previous = saved.get(body.requestKey);
        if (!previous) {
          saved.set(body.requestKey, { submissionId: ups[0], uploadIds: body.uploadIds, body: JSON.stringify(body) });
          throw new TypeError("response lost after save");
        }
        expect(JSON.stringify(body)).toBe(previous.body);
        replay = { submissionId: previous.submissionId, status: "pending", revision: 0, replayed: true };
        return Response.json(replay);
      }
      return Response.json({ items: Array.from(saved.values(), (entry) => item({ submissionId: entry.submissionId })) });
    }));
    Object.assign(URL, { createObjectURL: () => "blob:proof", revokeObjectURL: () => {} });
    authState.authenticated = true;
    const { container } = render(<ProofsScreen locale="ko" slug="mina" />);
    await fill(container);
    await press();
    expect(saved.size).toBe(1);
    await press();
    await waitFor(() => expect(replay).toMatchObject({ submissionId: ups[0], replayed: true }));
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(uploads).toBe(2);
    expect([...saved.values()]).toMatchObject([{ submissionId: ups[0], uploadIds: ups }]);
    await waitFor(() => expect(screen.getAllByText("심사 중")).toHaveLength(1));
  });
  it("starts a new attempt (new key, new uploads) when a field changes after a failure", async () => {
    const seen = setup([() => { throw new TypeError("connection lost"); }, () => Response.json({ submissionId: ups[0], status: "pending", revision: 0 })]);
    const { container } = render(<ProofsScreen locale="ko" slug="mina" />);
    await fill(container);
    await press();
    await waitFor(() => expect(seen.submits).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("한마디 (선택)"), { target: { value: "바꿈" } });
    await press();
    await waitFor(() => expect(seen.submits).toHaveLength(2));
    expect(seen.submits[1].requestKey).not.toBe(seen.submits[0].requestKey);
    expect(seen.uploadCount()).toBe(4);
  });
});

describe("a lost resubmit response (PROOF-RESUBMIT-IDEMP-1117)", () => {
  const mission = "55555555-5555-4555-8555-555555555555";
  const submission = "11111111-1111-4111-8111-111111111111";
  const ups = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4"];
  type Saved = { hash: string; revision: number };
  /** A server that stores the resubmit, then lets the first answer get lost; a resend of the same key and body is answered from the record. */
  const setup = (options: { lose?: boolean; fail?: number } = {}) => {
    const saved = new Map<string, Saved>();
    const requests: Array<Record<string, unknown>> = [];
    let uploads = 0, revision = 3, status = "changes_requested", lose = options.lose ?? true, fail = options.fail;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/uploads")) return Response.json({ uploadId: ups[uploads++] });
      if (url.includes("/missions")) return Response.json({ items: [{ missionId: mission, proofType: "receipt", platform: null, submittable: true, unavailableReason: null, closesAt: "2027-01-01T00:00:00Z" }] });
      if (url.includes("/posts")) return Response.json({ items: [], nextBefore: null });
      if (url.endsWith(`/api/me/proofs/${submission}/resubmit`) && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        requests.push(body);
        if (fail) return Response.json({ error: { code: "REVISION_CONFLICT" } }, { status: fail });
        const hash = JSON.stringify([body.expectedRevision, body.uploadIds, body.imagePhash, body.note ?? null]);
        const previous = saved.get(String(body.requestKey));
        if (previous) {
          if (previous.hash !== hash) return Response.json({ error: { code: "IDEMPOTENCY_MISMATCH" } }, { status: 409 });
          return Response.json({ submissionId: submission, status: "pending", revision: previous.revision, replayed: true });
        }
        if (status !== "changes_requested" || body.expectedRevision !== revision) return Response.json({ error: { code: "REVISION_CONFLICT" } }, { status: 409 });
        revision += 1; status = "pending";
        saved.set(String(body.requestKey), { hash, revision });
        if (lose) { lose = false; throw new TypeError("response lost after save"); }
        return Response.json({ submissionId: submission, status: "pending", revision, replayed: false });
      }
      if (url.includes("/api/me/proofs?creator=")) return Response.json({ items: [item({ submissionId: submission, status, revision, reason: status === "changes_requested" ? "금액이 가려졌어요" : null })] });
      return Response.json({ items: [] });
    }));
    Object.assign(URL, { createObjectURL: () => "blob:proof", revokeObjectURL: () => {} });
    authState.authenticated = true;
    authState.user = { id: "member-a" };
    return { requests, uploadCount: () => uploads, revision: () => revision };
  };
  const open = async (container: HTMLElement) => {
    fireEvent.click(await screen.findByRole("button", { name: "다시 제출" }));
    await screen.findByText("이름·주소·카드번호 등 개인정보를 가려서 올려 주세요");
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [new File(["x"], "a.png", { type: "image/png" }), new File(["y"], "b.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByLabelText("개인정보를 모두 가렸어요 (필수)"));
  };
  const press = async () => {
    const button = () => screen.getAllByRole("button", { name: "다시 제출" })[0] as HTMLButtonElement;
    await waitFor(() => expect(button().disabled).toBe(false));
    fireEvent.click(button());
    await waitFor(() => expect(screen.queryByRole("button", { name: proofsText("ko", "pfSubmitting") })).toBeNull());
  };
  afterEach(() => { vi.unstubAllGlobals(); authState.user = { id: "member-a" }; });

  it("resends the saved resubmit with the same key and body: no new upload, no second revision, the first success shows", async () => {
    const seen = setup();
    const { container } = render(<ProofsScreen locale="ko" slug="mina" />);
    await open(container);
    await press();
    await waitFor(() => expect(seen.requests).toHaveLength(1));
    expect(seen.uploadCount()).toBe(2);
    expect(seen.revision()).toBe(4);
    await press();
    await waitFor(() => expect(seen.requests).toHaveLength(2));
    expect(seen.requests[1]).toEqual(seen.requests[0]);
    expect(seen.requests[1]).toMatchObject({ requestKey: expect.any(String), expectedRevision: 3, uploadIds: ups.slice(0, 2), uploadId: ups[0] });
    expect(seen.uploadCount()).toBe(2);
    expect(seen.revision()).toBe(4);
    await waitFor(() => expect(screen.getAllByText("심사 중")).toHaveLength(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("starts a new draft (new key, new uploads) when a field changes after a failure", async () => {
    const seen = setup();
    const { container } = render(<ProofsScreen locale="ko" slug="mina" />);
    await open(container);
    await press();
    await waitFor(() => expect(seen.requests).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("한마디 (선택)"), { target: { value: "바꿈" } });
    await press();
    await waitFor(() => expect(seen.requests).toHaveLength(2));
    expect(seen.requests[1].requestKey).not.toBe(seen.requests[0].requestKey);
    expect(seen.uploadCount()).toBe(4);
  });
  it("starts a new draft when another member is signed in", async () => {
    const seen = setup();
    const { container, rerender } = render(<ProofsScreen locale="ko" slug="mina" />);
    await open(container);
    await press();
    await waitFor(() => expect(seen.requests).toHaveLength(1));
    authState.user = { id: "member-b" };
    rerender(<ProofsScreen locale="ko" slug="mina" />);
    await press();
    await waitFor(() => expect(seen.requests).toHaveLength(2));
    expect(seen.requests[1].requestKey).not.toBe(seen.requests[0].requestKey);
    expect(seen.uploadCount()).toBe(4);
  });
  it("drops the draft after an answer that proves nothing was stored", async () => {
    const seen = setup({ fail: 409 });
    const { container } = render(<ProofsScreen locale="ko" slug="mina" />);
    await open(container);
    await press();
    await waitFor(() => expect(seen.requests).toHaveLength(1));
    await press();
    await waitFor(() => expect(seen.requests).toHaveLength(2));
    expect(seen.requests[1].requestKey).not.toBe(seen.requests[0].requestKey);
    expect(seen.uploadCount()).toBe(4);
  });
});

describe("proof API calls carry the session token", () => {
  const ok = (body: unknown) => Response.json(body);
  const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const result = { submissionId: uuid, status: "pending", revision: 1 };
  const calls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
  afterEach(() => vi.unstubAllGlobals());

  it("sends Authorization on upload, submit, resubmit, history and missions, and leaves multipart headers to the browser", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/uploads")) return ok({ uploadId: uuid });
      if (url.includes("/missions") || (url.includes("/api/me/proofs?") )) return ok({ items: [] });
      return ok(result);
    });
    vi.stubGlobal("fetch", fetchMock);
    const getToken = async () => "session-token";
    await uploadProofImage(getToken, uuid, new Blob(["x"]));
    await submitProof(getToken, { creator: "mina", proofType: "ticket", uploadId: uuid, publishConsent: false, amountVisible: null, imagePhash: [] }).catch(() => undefined);
    await resubmitProof(getToken, uuid, { requestKey: uuid, expectedRevision: 1, uploadId: uuid, uploadIds: [uuid], imagePhash: [] }).catch(() => undefined);
    await listMyProofs(getToken, "mina").catch(() => undefined);
    await listProofMissions(getToken, "mina").catch(() => undefined);
    expect(calls(fetchMock)).toHaveLength(5);
    for (const [, init] of calls(fetchMock)) expect(init.headers).toMatchObject({ Authorization: "Bearer session-token" });
    const upload = calls(fetchMock)[0][1];
    expect(upload.body).toBeInstanceOf(FormData);
    expect(Object.keys(upload.headers as object).map((key) => key.toLowerCase())).not.toContain("content-type");
  });

  it("does not send the request and reports an auth failure when there is no token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const none = async () => null;
    for (const run of [
      () => uploadProofImage(none, uuid, new Blob(["x"])),
      () => submitProof(none, { creator: "mina", proofType: "ticket", uploadId: uuid, publishConsent: false, amountVisible: null, imagePhash: [] }),
      () => resubmitProof(none, uuid, { requestKey: uuid, expectedRevision: 1, uploadId: uuid, uploadIds: [uuid], imagePhash: [] }),
      () => listMyProofs(none, "mina"),
      () => listProofMissions(none, "mina"),
    ]) await expect(run()).rejects.toMatchObject({ kind: "auth", status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(new ProofRequestError("auth", 401).kind).toBe("auth");
  });

  it("shows the login entry instead of calling the server when signed out", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/posts") ? Response.json({ items: [], nextBefore: null }) : Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    authState.authenticated = false;
    render(<ProofsScreen locale="ko" slug="mina" />);
    expect(await screen.findByRole("link", { name: "로그인" })).toBeTruthy();
    expect(calls(fetchMock).some(([url]) => url.includes("/api/me/proofs"))).toBe(false);
    authState.authenticated = true;
  });
});

const feedItem = (over: Record<string, unknown> = {}) => ({ postId: "33333333-3333-4333-8333-333333333333", body: "hidden prose", createdAt: "2026-11-01T00:00:00Z", proofType: "receipt", amountVisible: null, imageUrl: "/api/pages/mina/posts/33333333-3333-4333-8333-333333333333/image?t=abc", jjinfanRank: null, awardedPoints: 37, ...over }) as never;

describe("proof tab (FB-N21)", () => {
  it("photo feed hides prose, shows only the recorded award and never a post without its picture", () => {
    const { container } = render(<ProofPhotoFeed locale="ko" items={[feedItem(), feedItem({ postId: "44444444-4444-4444-8444-444444444444", imageUrl: null, awardedPoints: 99 })]} />);
    expect(screen.queryByText("hidden prose")).toBeNull();
    expect(screen.getByText("+37")).toBeTruthy();
    expect(screen.queryByText("+99")).toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(container.querySelector("a")?.getAttribute("href")).toContain("/image?t=abc");
  });
  it("photo feed without a recorded award draws no points, and an empty feed is one line", () => {
    const { unmount } = render(<ProofPhotoFeed locale="ko" items={[feedItem({ awardedPoints: null })]} />);
    expect(screen.queryByText(/P$/)).toBeNull();
    unmount();
    render(<ProofPhotoFeed locale="ko" items={[]} />);
    expect(screen.getByText("아직 올라온 인증이 없어요")).toBeTruthy();
  });
  it("reward panel shows the policy points, the page counts above zero and one submit action", () => {
    const { unmount } = render(<ProofReward locale="ko" slug="mina" points={173} summary={{ approvedCount: 17, monthFanCount: 0, proofTypes: [] }} />);
    expect(screen.getByText("173")).toBeTruthy();
    expect(screen.getByText("누적 인증")).toBeTruthy();
    expect(screen.queryByText("이번 달 인증 팬")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    unmount();
    render(<ProofReward locale="ko" slug="mina" points={173} summary={null} />);
    expect(screen.queryByText("누적 인증")).toBeNull();
  });
  it("lists only the open proof kinds, each linking to its submit form with its own reward", () => {
    render(<ProofMethods locale="ko" slug="mina" types={["sns_post", "membership"]} pointsOf={(type) => (type === "sns_post" ? 31 : 173)} />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/c/mina/proofs?locale=ko&type=membership", "/c/mina/proofs?locale=ko&type=sns_post"]);
    expect(screen.getByText("+173")).toBeTruthy();
    expect(screen.getByText("+31")).toBeTruthy();
    expect(screen.queryByText("영수증")).toBeNull();
  });
  it("my rows show state and day, the reason when one was given, and resubmit only for changes_requested", () => {
    render(<MyProofRows locale="ko" slug="mina" items={[item({ status: "changes_requested", reason: "금액이 안 보여요" }), item({ submissionId: "22222222-2222-4222-8222-222222222222", status: "approved", proofType: "membership" })]} />);
    expect(screen.getByText("보완 요청")).toBeTruthy();
    expect(screen.getByText("금액이 안 보여요")).toBeTruthy();
    expect(screen.getByText("승인")).toBeTruthy();
    expect(screen.getAllByText("2026.11.01")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "다시 제출" })).toHaveLength(1);
  });

  const calls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
  const tabFetch = (over: { summary?: unknown; mine?: unknown; board?: unknown } = {}) => vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/proofs/summary")) return Response.json(over.summary ?? { approvedCount: 8, monthFanCount: 3, proofTypes: ["membership", "receipt"] });
    if (url.includes("/api/me/proofs")) return Response.json({ items: over.mine ?? [] });
    return Response.json(over.board ?? { items: [], nextBefore: null });
  });
  it("signed out: reward, counts and methods are public; my rows are locked and no personal request is sent", async () => {
    const fetchMock = tabFetch();
    vi.stubGlobal("fetch", fetchMock);
    authState.authenticated = false;
    const { container } = render(<PublicProofsTab locale="ko" slug="mina" />);
    expect(screen.getByText("173")).toBeTruthy();
    expect(screen.getByRole("link", { name: "인증하기" }).getAttribute("href")).toBe("/c/mina/proofs?locale=ko");
    await waitFor(() => expect(screen.getByText("누적 인증")).toBeTruthy());
    expect(screen.getByText("멤버십")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("아직 올라온 인증이 없어요")).toBeTruthy());
    expect(container.querySelector("[aria-hidden='true'] span")).toBeTruthy();
    expect(calls(fetchMock).some(([url]) => url.includes("/api/me/proofs"))).toBe(false);
    expect(calls(fetchMock).find(([url]) => url.includes("/proofs/summary"))?.[1]?.headers).toBeUndefined();
  });
  it("signed in: my submissions come with the session token; a page with nothing open hides the methods block", async () => {
    const fetchMock = tabFetch({ summary: { approvedCount: 0, monthFanCount: 0, proofTypes: [] }, mine: [item({ status: "rejected", reason: "다른 사람 영수증" })] });
    vi.stubGlobal("fetch", fetchMock);
    authState.authenticated = true;
    render(<PublicProofsTab locale="ko" slug="mina" />);
    await waitFor(() => expect(screen.getByText("다른 사람 영수증")).toBeTruthy());
    expect(screen.getByText("반려")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("인증 방법")).toBeNull());
    expect(screen.queryByText("누적 인증")).toBeNull();
    expect((calls(fetchMock).find(([url]) => url.includes("/api/me/proofs?creator=mina"))?.[1]?.headers as Record<string, string>).Authorization).toBe("Bearer session-token");
  });
});
