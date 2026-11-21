import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { FortuneReturnLink } from "../points/topup/return-link";
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
  vi.stubGlobal("fetch", async () => Response.json({ balance: 1, price: 3 }));
  render(<DatePurchase character="dosa" locale="ko" />);
  fireEvent.change(screen.getByLabelText("운세를 볼 날짜"), {
    target: { value: "20270515" },
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
    target: { value: "20270515" },
  });
  fireEvent.click(screen.getByText("가격 확인"));
  expect(await screen.findByText(message)).toBeTruthy();
});

it("returns to the selected date and requires confirmation again after a DEV top-up", async () => {
  const calls: { day: string; confirm: boolean }[] = [];
  let balance = 1;
  vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
    calls.push(JSON.parse(String(options.body)));
    return Response.json({
      balance,
      price: 3,
      topupPath: "/chemi/points/topup",
    });
  });
  history.replaceState({}, "", "/chemi/fortune?step=result&c=yuna&r=daily");
  const props = { character: "yuna", locale: "ko" };
  const first = render(<DatePurchase {...props} />);
  fireEvent.change(screen.getByLabelText("운세를 볼 날짜"), {
    target: { value: "20270515" },
  });
  fireEvent.click(screen.getByText("가격 확인"));
  const topup = await screen.findByRole("link", { name: "시험 포인트 충전" });
  const destination = new URL((topup as HTMLAnchorElement).href);
  first.unmount();
  history.replaceState({}, "", destination.pathname + destination.search);
  const checkout = render(<FortuneReturnLink />);
  checkout.unmount();
  history.replaceState({}, "", destination.pathname + "?paymentKey=fixture");
  const callback = render(<FortuneReturnLink />);
  const back = (
    screen.getByRole("link", {
      name: "선택한 날짜의 운세로 돌아가기",
    }) as HTMLAnchorElement
  ).href;
  callback.unmount();
  balance += 100;
  history.replaceState({}, "", back);
  render(<DatePurchase {...props} />);
  expect(screen.getByLabelText("운세를 볼 날짜")).toHaveValue("2027.05.15");
  fireEvent.click(screen.getByText("가격 확인"));
  expect(await screen.findByText("구매 후 잔액 98P")).toBeTruthy();
  expect(calls.map((c) => c.confirm)).toEqual([false, false]);
  fireEvent.click(screen.getByText("취소"));
  expect(calls).toHaveLength(2);
  expect(screen.getByRole("button", { name: "가격 확인" })).toBeDisabled();
});

it("takes the date as eight digits with a wheel, never the browser date input", async () => {
  const calls: { day: string }[] = [];
  vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
    calls.push(JSON.parse(String(options.body)));
    return Response.json({ balance: 5, price: 3 });
  });
  const { container } = render(<DatePurchase character="dosa" locale="ko" />);
  expect(container.querySelector('input[type="date"]')).toBeNull();
  const input = screen.getByLabelText("운세를 볼 날짜");
  expect(input).toHaveAttribute("inputmode", "numeric");
  fireEvent.change(input, { target: { value: "2027051" } });
  expect(input).toHaveValue("2027.05.1");
  expect(screen.getByRole("button", { name: "가격 확인" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "20270231" } });
  expect(screen.getByText("유효하지 않은 날짜입니다.")).toBeVisible();
  expect(screen.getByRole("button", { name: "가격 확인" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "20270515" } });
  fireEvent.click(screen.getByRole("button", { name: "가격 확인" }));
  expect(await screen.findByText("구매 후 잔액 2P")).toBeVisible();
  expect(calls[0].day).toBe("2027-05-15");
  // 휠: 올해 앞뒤 한 해씩 세 해를 고를 수 있고, 판 제목은 생년월일이 아니다.
  fireEvent.click(screen.getByRole("button", { name: "휠로 고르기" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("운세를 볼 날짜");
  expect(screen.getByRole("spinbutton", { name: "년" })).toHaveAttribute("aria-valuemax", "3");
});
