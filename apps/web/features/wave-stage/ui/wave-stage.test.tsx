import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stageFixture, completedStage, metricsFixture } from "../../../e2e/wave-stage-local/fixture";
import { WaveStageView } from "./wave-stage-view";
import { canDrawStage, clearStageAttempts, stageAttemptPrefix, useWaveStage } from "./use-wave-stage";

const getToken = async () => "test-token";
const respond = (stage = stageFixture) => Response.json({ stage });
const isMetrics = (url: unknown) => String(url).includes("live-dashboard");
beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("stage presentation", () => {
  const props = { locale: "ko" as const, stage: stageFixture, metrics: metricsFixture, role: "admin", video: <div>LIVE</div>, onRefresh: vi.fn(), onDraw: vi.fn() };
  it("requires explicit confirmation and shows each actual prize quantity", () => {
    render(<WaveStageView {...props} stage={{ ...stageFixture, creators: stageFixture.creators.map(c => ({ ...c, participantCount: 3 })) }} />);
    fireEvent.click(screen.getByRole("button", { name: "응모 마감 · 전체 추첨" }));
    const confirm = screen.getByRole("button", { name: "마감하고 추첨 · 동시 공개" });
    expect(confirm).toBeDisabled(); expect(screen.getAllByText("추첨 인원 3명")).toHaveLength(3);
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(confirm);
    expect(props.onDraw).toHaveBeenCalledOnce();
  });
  it("renders every one of 30 winners together and never offers a redraw", async () => {
    render(<WaveStageView {...props} stage={completedStage(true)} />);
    await waitFor(() => expect(screen.getAllByText(/^WAVE-/)).toHaveLength(30));
    expect(screen.queryByRole("button", { name: /응모 마감/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "참여 현황" })); expect(screen.getAllByText("1,284")).toHaveLength(2);
  });
  it("shows a refresh action on an initial query failure", () => {
    render(<WaveStageView {...props} stage={null} failed />); fireEvent.click(screen.getByRole("button", { name: "다시 조회" })); expect(props.onRefresh).toHaveBeenCalled();
  });
  it("keeps viewer access read only, with no confirmation trigger", () => {
    render(<WaveStageView {...props} role="viewer" />); expect(screen.getByText(/읽기 전용/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /응모 마감/ })).not.toBeInTheDocument();
  });
  it("marks processing and disables an additional submission", () => {
    const view = render(<WaveStageView {...props} />); fireEvent.click(screen.getByRole("button", { name: "응모 마감 · 전체 추첨" })); fireEvent.click(screen.getByRole("checkbox"));
    view.rerender(<WaveStageView {...props} busy />);
    expect(screen.getAllByRole("button", { name: "추첨 결과를 확인하는 중…" }).every(button => button.hasAttribute("disabled"))).toBe(true);
  });
  it("closes the confirmation after a definite conflict and explains the need to confirm again", () => {
    const view = render(<WaveStageView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "응모 마감 · 전체 추첨" })); fireEvent.click(screen.getByRole("checkbox"));
    view.rerender(<WaveStageView {...props} confirmationRevision={1} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(screen.getByText(/이번 요청은 실행되지 않았습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "응모 마감 · 전체 추첨" })); expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("blocks empty campaigns and conflicts without requiring chain metrics", () => {
    expect(canDrawStage(stageFixture, "viewer")).toBe(false); expect(canDrawStage({ ...stageFixture, drawConflict: true }, "admin")).toBe(false);
    expect(canDrawStage({ ...stageFixture, creators: stageFixture.creators.map(c => ({ ...c, participantCount: 0 })) }, "admin")).toBe(false);
    render(<WaveStageView {...props} metrics={{ ...metricsFixture, onchain: { state: "unavailable" } }} />);
    expect(screen.getByRole("button", { name: "응모 마감 · 전체 추첨" })).toBeEnabled(); expect(screen.getAllByText("—")).toHaveLength(4);
  });
});

describe("stage requests", () => {
  it("does not fetch or expose a stage when no access token is available", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(metricsFixture));
    const { result } = renderHook(() => useWaveStage("owner", async () => null));
    await waitFor(() => expect(result.current.access).toBe("unauthenticated")); expect(result.current.stage).toBeNull(); expect(fetcher.mock.calls.every(([url]) => isMetrics(url))).toBe(true);
  });
  it("preserves last values after a refresh failure", async () => {
    let fail = false; vi.spyOn(globalThis, "fetch").mockImplementation(async url => isMetrics(url) ? Response.json(metricsFixture) : fail ? new Response(null, { status: 503 }) : respond());
    const { result } = renderHook(() => useWaveStage("owner", getToken)); await waitFor(() => expect(result.current.stage).not.toBeNull());
    fail = true; await act(() => result.current.refresh()); expect(result.current.failed).toBe(true); expect(result.current.stage?.creators[0]?.participantCount).toBe(1284);
  });
  it("recovers a saved result via GET after a lost POST response", async () => {
    let saved = false;
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => { if (isMetrics(url)) return Response.json(metricsFixture); if (init?.method === "POST") { saved = true; throw new TypeError("Lost response"); } return respond(saved ? completedStage() : stageFixture); });
    const { result } = renderHook(() => useWaveStage("owner", getToken)); await waitFor(() => expect(result.current.stage).not.toBeNull()); await act(() => result.current.draw("admin"));
    expect(result.current.stage?.draw?.winners).toHaveLength(30); expect(result.current.uncertain).toBe(false); await act(() => result.current.draw("admin")); expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("persists the same request across remount and retries, without saving identities or winners", async () => {
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => { if (isMetrics(url)) return Response.json(metricsFixture); if (init?.method === "POST") { requests.push(String(init.body)); throw new TypeError("Offline"); } return respond(); });
    const first = renderHook(() => useWaveStage("owner", getToken)); await waitFor(() => expect(first.result.current.stage).not.toBeNull()); await act(() => first.result.current.draw("admin")); first.unmount();
    const second = renderHook(() => useWaveStage("owner", getToken)); await waitFor(() => expect(second.result.current.stage).not.toBeNull()); await act(() => second.result.current.draw("admin"));
    expect(requests).toHaveLength(2); expect(requests[0]).toBe(requests[1]);
    const saved = sessionStorage.getItem(`${stageAttemptPrefix("owner")}${stageFixture.eventKey}`)!; expect(Object.keys(JSON.parse(saved)).sort()).toEqual(["expectedRevisions", "idempotencyKey"]);
    clearStageAttempts("other-owner"); expect(sessionStorage.length).toBe(1); clearStageAttempts("owner"); expect(sessionStorage.length).toBe(0);
  });
  it("requires a new confirmation and request after a definite rolled-back conflict", async () => {
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (isMetrics(url)) return Response.json(metricsFixture);
      if (init?.method === "POST") { requests.push(String(init.body)); return Response.json({ error: { code: "FAN_WEB_CONFLICT" } }, { status: 409 }); }
      return respond();
    });
    const { result } = renderHook(() => useWaveStage("owner", getToken));
    await waitFor(() => expect(result.current.stage).not.toBeNull());
    await act(() => result.current.draw("admin"));
    expect(result.current.confirmationRevision).toBe(1); expect(result.current.uncertain).toBe(false); expect(result.current.failed).toBe(false); expect(sessionStorage.length).toBe(0);
    await act(() => result.current.draw("admin"));
    expect(JSON.parse(requests[0]!).idempotencyKey).not.toBe(JSON.parse(requests[1]!).idempotencyKey);
  });
  it("polls stage and public metrics independently, and pauses while hidden", async () => {
    vi.useFakeTimers();
    try {
      const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async url => isMetrics(url) ? Response.json(metricsFixture) : respond());
      const { unmount } = renderHook(() => useWaveStage("owner", getToken));
      await act(async () => {});
      await act(async () => { await vi.advanceTimersByTimeAsync(30_001); });
      expect(fetcher.mock.calls.filter(([url]) => !isMetrics(url))).toHaveLength(4);
      expect(fetcher.mock.calls.filter(([url]) => isMetrics(url))).toHaveLength(2);
      visibility.mockReturnValue("hidden"); act(() => document.dispatchEvent(new Event("visibilitychange")));
      const before = fetcher.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(30_001); });
      expect(fetcher).toHaveBeenCalledTimes(before);
      visibility.mockReturnValue("visible"); await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
      expect(fetcher).toHaveBeenCalledTimes(before + 2);
      unmount();
    } finally { vi.useRealTimers(); }
  });
  it("never submits for viewer access and cleans up requests on unmount", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async url => isMetrics(url) ? Response.json(metricsFixture) : respond());
    const { result, unmount } = renderHook(() => useWaveStage("owner", getToken)); await waitFor(() => expect(result.current.stage).not.toBeNull()); await act(() => result.current.draw("viewer"));
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false); const signals = fetcher.mock.calls.map(([, init]) => init?.signal); unmount(); expect(signals.every(signal => signal?.aborted)).toBe(true);
  });
});
