import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { ExtraPlayDialog } from "./extra-play-dialog";
import { getExtraPlayCopy } from "./extra-play-copy";

it("has every extra-play sentence in every app language", () => {
  for (const locale of APP_LOCALES) {
    const copy = getExtraPlayCopy(locale, 20);
    for (const [key, value] of Object.entries(copy)) expect(value, `${locale}.${key}`).toBeTruthy();
    expect(copy.title).toContain("20");
  }
});

it("shows the remaining extra games and points before and after the spend", () => {
  render(<ExtraPlayDialog open onOpenChange={() => {}} onConfirm={() => {}} busy={false} locale="ko" points={1262} cost={20} extraRemaining={2} />);
  expect(screen.getByRole("dialog", { name: "20P로 한 판 더" })).toBeInTheDocument();
  expect(screen.getByText("1,262P")).toBeInTheDocument();
  expect(screen.getByText("2번")).toBeInTheDocument();
  expect(screen.getByText("1번")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "남은 추가 판 2번 → 1번" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "20P 쓰고 시작" })).toBeEnabled();
});

it("blocks the spend and points to missions when points are short", () => {
  render(<ExtraPlayDialog open onOpenChange={() => {}} onConfirm={() => {}} busy={false} locale="ko" points={5} cost={20} extraRemaining={3} />);
  expect(screen.getByRole("button", { name: "20P 쓰고 시작" })).toBeDisabled();
  expect(screen.getByText("포인트가 15P 모자라요")).toBeInTheDocument();
  // 모자라면 '5P → 0P'처럼 빠질 것 같은 전후 값 대신 지금 값만(DF-GAME-007).
  expect(screen.getAllByText(/^\d+P$/).map((node) => node.textContent)).toEqual(["5P"]);
});
