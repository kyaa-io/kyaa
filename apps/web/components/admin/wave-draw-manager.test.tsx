import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({ session: { status: "authorized", admin: { email: "admin@example.com", role: "admin" } }, owner: "admin-one", token: "token-one" }));
const getAccessToken = vi.hoisted(() => vi.fn(async () => state.token));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ user: { id: state.owner }, getAccessToken }) }));
vi.mock("./use-admin-session", () => ({ useAdminSession: () => state.session }));
vi.mock("./operations-shell", () => ({ AdminOperationsShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/features/fanpage/ui/wave-draw", () => ({ wavePrizeImage: (key: string) => `/images/wave/prizes/${key}.webp`, WaveWinners: ({ winners }: { winners: { nickname: string }[] }) => <p>{winners.map(winner => winner.nickname).join(", ")}</p> }));
vi.mock("@/features/benefit/ui/raffle-result-reveal", () => ({ RaffleResultReveal: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
import { WaveDrawManager } from "./wave-draw-manager";
const draw = { id: "00000000-0000-4000-8000-000000000001", executedAt: "2026-10-22T11:00:00Z", revealedThrough: 0 };
const initial = { draw: null, entryCount: 20, results: [] };
const drawn = { ...initial, draw };
const endpoint = "/api/admin/kyaa-wave/draw";
function isPost(init?: RequestInit) { return init?.method === "POST"; }
beforeEach(() => {
  state.session = { status: "authorized", admin: { email: "admin@example.com", role: "admin" } }; state.owner = "admin-one"; state.token = "token-one";
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(initial)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });
async function confirmDraw() {
  fireEvent.click(await screen.findByRole("button", { name: "응모 마감·추첨 실행" }));
  expect(screen.getByRole("button", { name: "추첨 실행" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
}
describe("Wave draw operations", () => {
  it("keeps viewers read only and shows ten prizes and the total stock", async () => {
    state.session.admin.role = "viewer";
    render(<WaveDrawManager locale="ko" />);
    expect(await screen.findByRole("button", { name: "응모 마감·추첨 실행" })).toBeDisabled();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText(/총 67개/)).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !isPost(init))).toBe(true);
  });
  it("does not read or show private results before admin authorization", () => {
    state.session.status = "denied";
    render(<WaveDrawManager locale="ko" />);
    expect(screen.getByText("접근 권한을 확인할 수 없습니다")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires confirmation, prevents duplicate execution, retries with the same request ID and never offers a reroll", async () => {
    let fail = true;
    vi.mocked(fetch).mockImplementation(async (_url, init) => !isPost(init) ? Response.json(initial) : fail ? Response.json({}, { status: 503 }) : Response.json(drawn));
    render(<WaveDrawManager locale="ko" />);
    await confirmDraw();
    fireEvent.click(screen.getByRole("button", { name: "추첨 실행" }));
    fireEvent.click(screen.getByRole("button", { name: "처리 중…" }));
    await screen.findByRole("alert");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "추첨 실행" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => isPost(init));
    expect(posts).toHaveLength(2);
    expect(JSON.parse(posts[0][1]!.body as string).requestId).toBe(JSON.parse(posts[1][1]!.body as string).requestId);
    expect(screen.queryByRole("button", { name: "응모 마감·추첨 실행" })).not.toBeInTheDocument();
  });
  it("publishes only the next prize and retains its request ID after failure", async () => {
    let fail = true, snapshot = drawn;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (!isPost(init)) return Response.json(snapshot);
      if (fail) return Response.json({}, { status: 503 });
      snapshot = { ...drawn, draw: { ...draw, revealedThrough: 1 } };
      return Response.json(snapshot);
    });
    render(<WaveDrawManager locale="ko" />);
    fireEvent.click(await screen.findByRole("button", { name: "다음 경품 공개: 1. 엠블룩 의류" }));
    await screen.findByRole("alert"); fail = false;
    fireEvent.click(screen.getByRole("button", { name: "다음 경품 공개: 1. 엠블룩 의류" }));
    await screen.findByRole("button", { name: "다음 경품 공개: 2. Chillsa 모자" });
    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => isPost(init));
    expect(posts.map(([url]) => url)).toEqual([`${endpoint}/reveal`, `${endpoint}/reveal`]);
    expect(JSON.parse(posts[0][1]!.body as string)).toEqual(expect.objectContaining({ drawId: draw.id, prizeIndex: 1 }));
    expect(posts[0][1]!.body).toBe(posts[1][1]!.body);
  });
  it("synchronizes visible reads every five seconds and cleans up on session changes", async () => {
    const view = render(<WaveDrawManager locale="en" />);
    await screen.findByRole("button", { name: "Close entries and run draw" });
    const before = vi.mocked(fetch).mock.calls.length;
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    // Remount starts the timer under fake time.
    view.unmount();
    const nextView = render(<WaveDrawManager locale="en" />);
    await act(async () => {});
    await act(async () => vi.advanceTimersByTime(5000));
    expect(vi.mocked(fetch).mock.calls.length).toBe(before + 2);
    visibility.mockReturnValue("hidden");
    await act(async () => vi.advanceTimersByTime(10000));
    expect(vi.mocked(fetch).mock.calls.length).toBe(before + 2);
    state.owner = "admin-two"; state.token = "token-two";
    nextView.rerender(<WaveDrawManager locale="en" />);
    await act(async () => {});
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.headers).toEqual({ authorization: "Bearer token-two" });
    nextView.unmount();
    const end = vi.mocked(fetch).mock.calls.length;
    await act(async () => vi.advanceTimersByTime(10000));
    expect(vi.mocked(fetch).mock.calls.length).toBe(end);
  });
  it("clears results and write actions if an API read loses admin access", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({}, { status: 403 }));
    render(<WaveDrawManager locale="ko" />);
    expect(await screen.findByText("접근 권한을 확인할 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByText("엠블룩 의류")).not.toBeInTheDocument();
  });
  it("displays the final state without another publish action", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...drawn, draw: { ...draw, revealedThrough: 10 } }));
    render(<WaveDrawManager locale="ko" />);
    await screen.findByText("모든 경품을 공개했습니다.");
    expect(screen.queryByRole("button", { name: /다음 경품 공개/ })).not.toBeInTheDocument();
  });
});
