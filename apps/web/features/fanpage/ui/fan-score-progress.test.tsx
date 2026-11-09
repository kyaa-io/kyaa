import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FanScoreProgress } from "./fan-score-progress";

const passport = { id: "passport-one", tier: "Bronze", score: 2, remainingToNextTier: 13 } as const;
const stage = (key: string, tier: string, subdivision: number, rank: number, minimumScore: number) => ({ key, tier, subdivision, rank, minimumScore }) as never;
const bronze = { policyVersion: 3 as const, current: stage("bronze-1", "Bronze", 1, 1, 0), next: stage("silver-1", "Silver", 1, 2, 0), remaining: 1, progressPercent: 66, unit: "stamps" as const };

describe("fan score details", () => {
  it("speaks of the next step only from the server stage: slots before Silver (BUGS-1846)", () => {
    render(<FanScoreProgress passport={{ ...passport, stageProgress: bronze }} locale="ko" />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getAllByText("2점")[0]).toBeVisible();
    expect(screen.getAllByText("실버까지 도장 1칸")[0]).toBeVisible();
    const progress = screen.getByRole("progressbar", { name: "팬 등급 진행도" });
    expect(progress).toHaveAttribute("value", "66");
    expect(progress).toHaveAttribute("max", "100");
    expect(progress).toHaveAttribute("aria-valuetext", "실버까지 도장 1칸. 현재 점수: 2점");
    fireEvent.click(screen.getByRole("button", { name: "팬 점수 자세히 보기" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("실버까지 도장 1칸");
    expect(screen.getByRole("tooltip")).toHaveTextContent("현재 점수2점");
  });

  it("counts hearts from Silver and names a stage inside a tier", () => {
    const { rerender } = render(<FanScoreProgress passport={{ ...passport, tier: "Silver", score: 60, stageProgress: { ...bronze, current: stage("silver-2", "Silver", 2, 3, 0), next: stage("gold-1", "Gold", 1, 4, 1), remaining: 1, progressPercent: 0, unit: "hearts" as const } }} locale="ko" />);
    expect(screen.getAllByText("골드까지 하트 1개")[0]).toBeVisible();
    expect(screen.queryByText(/까지 \d+점/)).not.toBeInTheDocument();
    rerender(<FanScoreProgress passport={{ ...passport, tier: "Gold", score: 60, stageProgress: { ...bronze, current: stage("gold-1", "Gold", 1, 4, 1), next: stage("gold-2", "Gold", 2, 5, 8), remaining: 5, progressPercent: 28, unit: "hearts" as const } }} locale="ko" />);
    expect(screen.getAllByText("골드 2까지 하트 5개")[0]).toBeVisible();
  });

  it("draws no next step without a stage projection", () => {
    render(<FanScoreProgress passport={passport} locale="ko" />);
    expect(screen.queryByText(/까지/)).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0");
  });

  it("toggles on tap and dismisses on outside press or Escape", () => {
    render(<FanScoreProgress passport={passport} locale="ko" />);
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows details on keyboard focus in other locales and dismisses when focus leaves", () => {
    render(<FanScoreProgress passport={{ ...passport, stageProgress: bronze }} locale="en" />);
    const trigger = screen.getByRole("button", { name: "View Fan Score details" });
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Stamps to Silver: 1");
    fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("says every stage is reached at the top", () => {
    render(<FanScoreProgress passport={{ ...passport, tier: "Diamond", score: 250, stageProgress: { ...bronze, current: stage("diamond-1", "Diamond", 1, 11, 28), next: null, remaining: 0, progressPercent: 100, unit: "hearts" as const } }} locale="ko" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("모든 단계를 달성했어요");
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "100");
  });
});
