import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ShareLanding } from "./share-landing";

afterEach(() => vi.unstubAllGlobals());

const serve = (card: unknown) => vi.stubGlobal("fetch", vi.fn(async () => Response.json(card)));

it("shows the shared line and opens that creator's first scene without login (DF-FORT-003)", async () => {
  serve({ content: "fortune", character: "elina", day: "2026-11-23", line: "부탁은 오전에 해 봐요.", title: "차곡차곡 쌓이는 날", score: 72, grade: "무난한 날", keywords: { fandom: 74, color: "초록", luckyHour: { start: 9, end: 11 } } });
  render(<ShareLanding locale="ko" from="abc" content="fortune" />);
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("차곡차곡 쌓이는 날");
  expect(screen.getByText("부탁은 오전에 해 봐요.")).toBeVisible();
  expect(screen.getByText("행운색 초록")).toBeVisible();
  expect(screen.getByRole("link", { name: "내 오늘 운세 보기" })).toHaveAttribute("href", "/chemi/fortune?locale=ko&c=elina");
  expect(screen.getByRole("link", { name: "뒤로 가기" })).toHaveAttribute("href", "/chemi?locale=ko");
});

it("hides the number on a rest day", async () => {
  serve({ content: "fortune", character: "dosa", line: "쉬시오.", score: 54, grade: "쉬어 가는 날" });
  render(<ShareLanding locale="ko" from="abc" content="fortune" />);
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("쉬어 가는 날");
  expect(screen.queryByText("54")).toBeNull();
});

it("keeps a way in when the card expired or has no line", async () => {
  serve({ gone: true, content: "saju", character: "yuna" });
  const { unmount } = render(<ShareLanding locale="ko" from="old" content="saju" />);
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("자랑 카드를 볼 수 있는 기간이 지났어요");
  expect(screen.getByRole("link", { name: "내 사주 보기" })).toHaveAttribute("href", "/chemi/saju?locale=ko&c=yuna");
  unmount();
  serve({ content: "fortune", character: "changha" });
  render(<ShareLanding locale="ko" from="legacy" content="fortune" />);
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("친구가 자랑한 오늘의 운세");
  expect(screen.getByRole("link", { name: "내 오늘 운세 보기" })).toBeVisible();
});
