import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { getRunCopy } from "./copy";
import { ResultStage } from "./result";
import { SelectStage } from "./select";
import { Track } from "./track";

vi.mock("./render", async (load) => ({ ...await load<typeof import("./render")>(), loadArt: () => new Promise(() => {}) }));

const copy = getRunCopy("ko");
const names = { changha: copy.changha, elina: copy.elina, yuna: copy.yuna };
const select = (props: { waiting: boolean; loading: boolean; errorLine: React.ReactNode }) => <SelectStage character="changha" pickDisabled={false} onPick={() => {}}
  copy={copy} locale="ko" names={names} rows={[]} loaded={false} footer="" spent={false} startLabel="—P로 1판 더 · 오늘 0번 남음" startDisabled
  onStart={() => {}} onAllRanks={() => {}} reminder={null} {...props} />;

it("holds the start button's place without a count while the lobby is loading", () => {
  const { container } = render(select({ waiting: true, loading: true, errorLine: false }));
  expect(screen.queryByText(/0번 남음/)).toBeNull();
  expect(screen.queryByRole("button", { name: /1판 더|시작/ })).toBeNull();
  expect(container.querySelectorAll("[aria-hidden='true'][class*='bar']").length).toBeGreaterThanOrEqual(4);
});

it("shows only the error line and its retry when the lobby failed", () => {
  render(select({ waiting: true, loading: false, errorLine: <div role="alert">{copy.error}<button type="button">{copy.retry}</button></div> }));
  expect(screen.getByRole("alert")).toHaveTextContent("불러오지 못했어요.");
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  expect(screen.queryByText(/0번 남음/)).toBeNull();
});

it("writes the affinity line as name · 친밀 with the gain on the right, or 오늘 받음 after the first run", () => {
  const props = { character: "changha" as const, copy, locale: "ko", names, rows: [], loaded: true, before: { best: 0 }, saving: false, trial: false, member: true,
    spent: false, free: 1, extra: 0, busy: false, copied: false, onAgain: () => {}, onLogin: () => {}, onShare: () => {}, onAllRanks: () => {}, errorLine: false, reminder: null };
  const { rerender } = render(<ResultStage {...props} result={{ score: 900, exp: 10 }} />);
  expect(screen.getByText("창하 · 친밀")).toBeInTheDocument();
  expect(screen.getByText("+10")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /다시 하기 · 남은 판 1/ })).toBeInTheDocument();
  rerender(<ResultStage {...props} result={{ score: 900, exp: 0 }} />);
  expect(screen.getByText("오늘 받음")).toBeInTheDocument();
});

const sound = { play: () => {}, unlock: () => {}, music: () => {}, set: () => {}, close: () => {}, visibility: () => {} } as unknown as import("./sound").RunSound;
const ticket = { playId: "p1", seed: 1 };
const track = (rerun: boolean, pauseRequest: number) => <Track character="changha" ticket={ticket} copy={copy} locale="ko" name={copy.changha}
  sound={sound} soundOn={false} onToggleSound={() => {}} pauseRequest={pauseRequest} onFinish={() => {}} rerun={rerun} />;
const stage = (container: HTMLElement) => container.querySelector("section[data-stage]")!.getAttribute("data-stage");

it("starts a run from the result without the ready veil, and only a new back press pauses it", () => {
  const { container, rerender } = render(track(true, 2));
  expect(stage(container)).toBe("play");
  expect(screen.queryByRole("button", { name: copy.go })).toBeNull();
  rerender(track(true, 3));
  expect(stage(container)).toBe("paused");
});

it("keeps the ready veil on the first run of a visit", () => {
  const { container } = render(track(false, 0));
  expect(stage(container)).toBe("ready");
  expect(screen.getByRole("button", { name: copy.go })).toBeInTheDocument();
});
