import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DatePurchase } from "./date-purchase";

vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ getAccessToken: async () => "fixture" }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState({}, "", "/");
});

it("returns to the selected date and requires confirmation again after a DEV top-up", async () => {
  const calls: { day: string; confirm: boolean }[] = [];
  let balance = 1;
  vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
    calls.push(JSON.parse(String(options.body)));
    return Response.json({ balance, price: 3, topupPath: "/chemi/points/topup" });
  });
  history.replaceState({}, "", "/chemi/fortune?step=result&c=yuna&r=daily");
  const props = { character: "yuna", locale: "ko" };
  const first = render(<DatePurchase {...props} />);
  fireEvent.change(screen.getByLabelText("운세를 볼 날짜"), { target: { value: "2027-05-15" } });
  fireEvent.click(screen.getByText("가격 확인"));
  const topup = await screen.findByRole("link", { name: "시험 포인트 충전" });
  const back = new URL((topup as HTMLAnchorElement).href).searchParams.get("returnTo")!;
  first.unmount();
  balance += 100;
  history.replaceState({}, "", back);
  render(<DatePurchase {...props} />);
  expect(screen.getByLabelText("운세를 볼 날짜")).toHaveValue("2027-05-15");
  fireEvent.click(screen.getByText("가격 확인"));
  expect(await screen.findByText("구매 후 잔액 98P")).toBeTruthy();
  expect(calls.map(c => c.confirm)).toEqual([false, false]);
  fireEvent.click(screen.getByText("취소"));
  expect(calls).toHaveLength(2);
  expect(screen.getByRole("button", { name: "가격 확인" })).toBeDisabled();
});

it("shows activity earning when the production balance is short", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ balance: 1, price: 3 }));
  render(<DatePurchase character="dosa" locale="ko" />);
  fireEvent.change(screen.getByLabelText("운세를 볼 날짜"), { target: { value: "2027-05-15" } });
  fireEvent.click(screen.getByText("가격 확인"));
  expect(await screen.findByText("2P가 부족해요.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "출석하고 포인트 받기" })).toBeTruthy();
  expect(screen.queryByText("시험 포인트 충전")).toBeNull();
});
