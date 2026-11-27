import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ShortLinkList, SignupTouchesContent } from "./signup-touches";

it("copies a short address and lists every code with where it opens", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<ShortLinkList locale="ko" />);
  expect(screen.getByRole("rowheader", { name: /kyaa\.io\/go\/kol-alina/ })).toHaveTextContent("/s/raffle · x / kol / alina");
  fireEvent.click(screen.getByRole("button", { name: "kyaa.io/go/mail-raffle 복사" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://kyaa.io/go/mail-raffle"));
  expect(await screen.findByRole("button", { name: "kyaa.io/go/mail-raffle 복사됨" })).toBeInTheDocument();
});

it("names the paths and apps in Korean and keeps tag paths as they are", () => {
  render(<SignupTouchesContent locale="ko" data={{
    days: 7, from: "2026-11-20T00:00:00+09:00", to: "2026-11-26T19:00:00+09:00", timeZone: "Asia/Seoul", total: 3,
    paths: [{ label: "x / kol / alina", signups: 2 }, { label: "unrecorded", signups: 1 }],
    apps: [{ label: "x", signups: 2 }, { label: "browser", signups: 1 }],
    daily: [{ date: "2026-11-26", signups: 3 }],
    hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, signups: hour === 18 ? 3 : 0 })),
    pathHours: [{ label: "x / kol / alina", date: "2026-11-26", hour: 18, signups: 2 }],
  }} />);
  expect(screen.getByRole("heading", { name: "시간대별 가입 3명" })).toBeInTheDocument();
  expect(screen.getAllByText("x / kol / alina").length).toBeGreaterThan(0);
  expect(screen.getByText("기록 시작 전 가입")).toBeInTheDocument();
  expect(screen.getByText("X 앱")).toBeInTheDocument();
  expect(screen.getByText("11-26 18:00")).toBeInTheDocument();
});
