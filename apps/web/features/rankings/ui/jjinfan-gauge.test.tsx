import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ state: { status: "loading" } as unknown, url: "", toast: vi.fn() }));
vi.mock("./use-ranking-resource", () => ({ useRankingResource: (url: string) => { h.url = url; return { state: h.state, retry: vi.fn() }; } }));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: h.toast }));
import { jjinfanChallengeSchema } from "../domain/types";
import { JjinfanGauge, challengeEndDate } from "./jjinfan-gauge";
import { JjinfanSeed } from "./jjinfan-seed";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); h.toast.mockClear(); Reflect.deleteProperty(navigator, "share"); });
const ready = (data: unknown) => { h.state = { status: "ready", data }; };

it("renders nothing while loading, on failure, and for a creator that is not taking part", () => {
  for (const state of [{ status: "loading" }, { status: "error" }, { status: "ready", data: { count: 3, target: 100, campaign: null } }, { status: "ready", data: { count: 3, target: 100 } }]) {
    h.state = state;
    const { container } = render(<JjinfanGauge slug="elina" locale="ko" />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
  }
});

it("shows the challenge, the live count against 100, the last day and the administrator's line, with no character art", () => {
  ready({ count: 67, target: 100, campaign: { title: "운영자 제목", description: "운영자 설명", endsOn: "2026-11-30" } });
  const { container } = render(<JjinfanGauge slug="elina" locale="ko" name="엘리나" />);
  expect(h.url).toBe("/api/pages/elina/jjinfan-challenge");
  expect(screen.getByRole("heading", { name: "찐팬 100 챌린지" })).toBeInTheDocument();
  expect(screen.getByText("67 / 100명")).toBeInTheDocument();
  expect(screen.getByText("11. 30.까지 · 운영자 설명")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "67");
  expect(screen.queryByText("달성")).not.toBeInTheDocument();
  expect(container.querySelector("[data-fan-gathering], [data-marble-tray]")).toBeNull();
  expect(screen.queryByText(/100명부터/)).not.toBeInTheDocument();
});

it("caps the bar past the target, marks it reached and leaves out an empty line", () => {
  ready({ count: 104, target: 100, campaign: { title: "제목", description: "" } });
  const { container } = render(<JjinfanGauge slug="elina" locale="ko" />);
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  expect(screen.getByText("100 / 100명")).toBeInTheDocument();
  expect(screen.getByText("달성")).toBeInTheDocument();
  expect(container.querySelectorAll("p")).toHaveLength(1);
});

it("shares the fan page link with the common UTM shape, or copies it where there is no share sheet", async () => {
  ready({ count: 67, target: 100, campaign: { title: "제목", description: "" } });
  const share = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  render(<JjinfanGauge slug="elina" locale="ko" name="엘리나" />);
  fireEvent.click(screen.getByRole("button", { name: "공유" }));
  await waitFor(() => expect(share).toHaveBeenCalled());
  const shared = (share.mock.calls[0] as unknown as [{ title: string; url: string }])[0];
  expect(shared.title).toBe("엘리나 · 찐팬 100 챌린지");
  expect(Object.fromEntries(new URL(shared.url).searchParams)).toMatchObject({ share: "jjinfan", utm_source: "kyaa", utm_medium: "share", utm_campaign: "elina", utm_content: "jjinfan_gauge.share" });
  Reflect.deleteProperty(navigator, "share");
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  fireEvent.click(screen.getByRole("button", { name: "공유" }));
  await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ title: "링크를 복사했어요", tone: "success" }));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/elina?"));
});

it("formats the last day in the viewer's language and accepts old and new answers", () => {
  expect(challengeEndDate("2026-11-30", "ko")).toBe("11. 30.");
  expect(challengeEndDate("2026-11-30", "en")).toBe("11/30");
  expect(jjinfanChallengeSchema.parse({ count: 1, target: 100 }).campaign).toBeUndefined();
  expect(jjinfanChallengeSchema.parse({ count: 1, target: 100, campaign: { title: "t", description: "" } }).campaign?.title).toBe("t");
  expect(jjinfanChallengeSchema.parse({ count: 1, target: 100, campaign: { title: "t", description: "", endsOn: null } }).campaign?.endsOn).toBeNull();
});

it("draws the server's answer while the client read is pending or failed, and nothing when the server says off", () => {
  const seeded = { count: 40, target: 100 as const, campaign: { title: "제목", description: "", endsOn: null } };
  for (const state of [{ status: "loading" }, { status: "error" }]) {
    h.state = state;
    render(<JjinfanSeed slug="elina" value={seeded}><JjinfanGauge slug="elina" locale="ko" /></JjinfanSeed>);
    expect(screen.getByText("40 / 100명")).toBeInTheDocument();
    cleanup();
  }
  h.state = { status: "loading" };
  const off = render(<JjinfanSeed slug="elina" value={{ count: 3, target: 100, campaign: null }}><JjinfanGauge slug="elina" locale="ko" /></JjinfanSeed>);
  expect(off.container).toBeEmptyDOMElement();
  cleanup();
  // Another creator's seed is not used.
  const other = render(<JjinfanSeed slug="wena" value={seeded}><JjinfanGauge slug="elina" locale="ko" /></JjinfanSeed>);
  expect(other.container).toBeEmptyDOMElement();
  cleanup();
  // The client answer replaces the seed once it lands.
  ready({ count: 41, target: 100, campaign: { title: "제목", description: "" } });
  render(<JjinfanSeed slug="elina" value={seeded}><JjinfanGauge slug="elina" locale="ko" /></JjinfanSeed>);
  expect(screen.getByText("41 / 100명")).toBeInTheDocument();
});
