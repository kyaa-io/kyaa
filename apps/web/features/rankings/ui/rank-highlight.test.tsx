// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RankHighlight, pickHighlight, type HighlightRow } from "./rank-highlight";

const row = (key: string, delta: number | null, dayGain: number | null): HighlightRow => ({ key, name: `이름${key}`, avatar: <i data-testid={`avatar-${key}`} />, delta, dayGain });

it("picks the biggest real climb first, then the most hearts gained today, then nothing; the first row wins a tie", () => {
  expect(pickHighlight([row("a", 1, 50), row("b", 3, 5), row("c", 3, 99)])).toMatchObject({ kind: "rise", value: 3, row: { key: "b" } });
  expect(pickHighlight([row("a", 0, 4), row("b", null, 9), row("c", -2, 9)])).toMatchObject({ kind: "day", value: 9, row: { key: "b" } });
  expect(pickHighlight([row("a", 0, 0), row("b", null, null), row("c", -1, -3)])).toEqual({ kind: "none" });
  expect(pickHighlight([])).toEqual({ kind: "none" });
});

it("names the person and the real value, or says nothing changed", () => {
  const view = render(<RankHighlight locale="ko" rows={[row("a", 99, 210)]} />);
  expect(screen.getByText("오늘 가장 많이 오름")).toBeInTheDocument();
  expect(screen.getByText("이름a")).toBeInTheDocument();
  expect(screen.getByLabelText("99계단 올라감")).toBeInTheDocument();
  view.rerender(<RankHighlight locale="ko" rows={[row("a", 0, 3)]} />);
  expect(screen.getByText("오늘 하트 최다")).toBeInTheDocument();
  expect(screen.getByText("+3")).toBeInTheDocument();
  view.rerender(<RankHighlight locale="ko" rows={[row("a", 0, 0)]} />);
  expect(screen.getByText("변동 없음")).toBeInTheDocument();
  expect(screen.queryByTestId("avatar-a")).toBeNull();
});

it("while loading it holds the frame without a word or a name", () => {
  const { container } = render(<RankHighlight locale="ko" loading rows={[]} />);
  expect(container.querySelector("[data-rank-highlight='loading']")).not.toBeNull();
  expect(container.textContent).toBe("");
});
