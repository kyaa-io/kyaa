import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { RaffleResultCapsule, type RaffleCapsuleResult } from "./raffle-result-capsule";

const engine = vi.hoisted(() => ({ play: vi.fn(async () => ["#b79cf0"]), clear: vi.fn() }));
const gpu = vi.hoisted(() => ({ ok: true }));
vi.mock("./gpu", () => ({ canRunCapsuleMachine: async () => gpu.ok }));
// jsdom에는 three.js가 없다: 동적 캔버스 자리에 엔진을 바로 넘기는 표지만 둔다.
vi.mock("next/dynamic", async () => {
  const { useEffect } = await import("react");
  return { default: () => function MachineCanvasStub({ onEngine }: { onEngine: (e: unknown) => void }) { useEffect(() => { onEngine(engine); }, [onEngine]); return <canvas data-testid="machine-canvas" />; } };
});
function media(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}
beforeEach(() => { engine.play.mockClear(); engine.clear.mockClear(); gpu.ok = true; media(false); });
const labels = { title: "래플 결과", won: "US$50 당첨", lost: "이번에는 당첨되지 않았어요", thanks: "응모해 주셔서 고마워요", claim: "가입 이메일로 수령 안내를 보내 드려요", claimCta: "수령 안내 보기" };
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const view = (result: RaffleCapsuleResult, onClaim = vi.fn()) => render(<RaffleResultCapsule open onOpenChange={vi.fn()} result={result} locale="ko" labels={labels} onClaim={onClaim} />);

it("plays the server result once through the capsule machine, then shows the prize card and the claim path", async () => {
  const onClaim = vi.fn();
  view({ state: "won", usd: 50 }, onClaim);
  await settle();
  expect(engine.play).toHaveBeenCalledExactlyOnceWith(1, [{ level: 1, imageUrl: null }]);
  expect(screen.getByText("US$50 당첨")).toBeTruthy();
  expect(document.querySelector('[data-fan-print="gift-card"]')?.textContent).toContain("US$50");
  fireEvent.click(screen.getByRole("button", { name: "수령 안내 보기" }));
  expect(onClaim).toHaveBeenCalledOnce();
});

it("stages the top prize as the rare capsule and a loss as an empty capsule with a short thanks", async () => {
  view({ state: "won", usd: 100 });
  await settle();
  expect(engine.play).toHaveBeenLastCalledWith(1, [{ level: 2, imageUrl: null }]);
  document.body.innerHTML = "";
  view({ state: "lost" });
  await settle();
  expect(engine.play).toHaveBeenLastCalledWith(1, [{ level: 0, imageUrl: null }]);
  expect(screen.getByText("이번에는 당첨되지 않았어요")).toBeTruthy();
  expect(screen.getByText("응모해 주셔서 고마워요")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "수령 안내 보기" })).toBeNull();
  expect(document.querySelector('[data-fan-print="gift-card"]')).toBeNull();
});

it.each([["reduced motion", true, true], ["no GPU", false, false]])("shows the result at once without the machine for %s", async (_name, reduced, ok) => {
  media(reduced); gpu.ok = ok;
  view({ state: "won", usd: 10 });
  await settle();
  expect(screen.queryByTestId("machine-canvas")).toBeNull();
  expect(engine.play).not.toHaveBeenCalled();
  expect(document.querySelector("[data-raffle-capsule]")?.getAttribute("data-raffle-capsule")).toBe("shown");
  expect(screen.getByText("US$50 당첨")).toBeTruthy();
});
