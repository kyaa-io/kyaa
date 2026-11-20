import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DatePurchase, DATE_READING_PRICE } from "./date-purchase";

vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ getAccessToken: async () => "fixture" }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState({}, "", "/");
});

it("shows the standard price before a date is selected", () => {
  const migration = readFileSync("../../supabase/migrations/20270113020000_chemi_point_date.sql", "utf8");
  expect(migration).toContain(`price constant integer := ${DATE_READING_PRICE};`);
  render(<DatePurchase character="dosa" locale="ko" />);
  expect(screen.getByRole("heading").textContent).toContain(`${DATE_READING_PRICE}P`);
});

it("shows activity earning when the production balance is short", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ balance: 1, price: 3, topupPath: "/chemi/points/topup" }));
  render(<DatePurchase character="dosa" locale="ko" />);
  fireEvent.change(screen.getByLabelText("운세를 볼 날짜"), {
    target: { value: "2027-05-15" },
  });
  fireEvent.click(screen.getByText("가격 확인"));
  expect(await screen.findByText("2P가 부족해요.")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "출석하고 포인트 받기" }),
  ).toBeTruthy();
  expect(screen.queryByText("시험 포인트 충전")).toBeNull();
});

it.each([
  [2, "1P가 부족해요."],
  [3, "구매 후 잔액 0P"],
  [4, "구매 후 잔액 1P"],
] as const)("quotes a 3P purchase with a %iP balance", async (balance, message) => {
  vi.stubGlobal("fetch", async () => Response.json({ balance, price: 3 }));
  render(<DatePurchase character="dosa" locale="ko" />);
  fireEvent.change(screen.getByLabelText("운세를 볼 날짜"), {
    target: { value: "2027-05-15" },
  });
  fireEvent.click(screen.getByText("가격 확인"));
  expect(await screen.findByText(message)).toBeTruthy();
});
