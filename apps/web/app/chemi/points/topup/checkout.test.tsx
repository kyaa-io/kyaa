import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Checkout } from "./checkout";

vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ getAccessToken: async () => "fixture" }),
}));
vi.mock("next/script", async () => {
  const { useEffect } = await import("react");
  return { default: ({ onReady }: { onReady: () => void }) => { useEffect(() => onReady(), [onReady]); return null; } };
});
const balances = (activity: number, paid: number) => ({ balances: [{ activity_points: activity, paid_points: paid, total_points: activity + paid }] });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  history.replaceState({}, "", "/");
});
function stubApi(handler: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push(body);
    return handler(body);
  });
  return calls;
}

it("shows both balances and opens a Toss payment for 1,000 won", async () => {
  const requestPayment = vi.fn(async () => undefined);
  vi.stubGlobal("TossPayments", () => ({ requestPayment }));
  const calls = stubApi((body) =>
    body.action === "open"
      ? Response.json({ orderId: "order-1", amount: 1000, orderName: "포인트 100P", clientKey: "test_ck_x" })
      : Response.json(balances(2, 1)),
  );
  render(<Checkout locale="ko" />);
  expect(await screen.findByText("활동 포인트")).toBeTruthy();
  await waitFor(() => expect(screen.getByText("3")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "1,000원 결제하기" }));
  await waitFor(() => expect(requestPayment).toHaveBeenCalled());
  expect(calls.map((c) => c.action)).toEqual(["balances", "open"]);
  expect(requestPayment).toHaveBeenCalledWith("카드", expect.objectContaining({ orderId: "order-1", amount: 1000 }));
  expect(sessionStorage.getItem("chemi-point-order")).toBe("order-1");
});

it("confirms the Toss callback once and reports the new balances", async () => {
  history.replaceState({}, "", "/chemi/points/topup?paymentKey=pay_1&orderId=order-1&amount=1000");
  const calls = stubApi(() => Response.json({ status: "DONE", ...balances(0, 100) }));
  render(<Checkout locale="ko" />);
  expect(await screen.findByText("100P가 충전됐어요.")).toBeTruthy();
  expect(calls).toEqual([{ action: "confirm", paymentKey: "pay_1", orderId: "order-1", amount: 1000 }]);
  expect(location.search).toBe("");
});

it("reports a failed payment without calling the server for it", async () => {
  sessionStorage.setItem("chemi-point-order", "order-1");
  history.replaceState({}, "", "/chemi/points/topup?failed=1");
  const calls = stubApi(() => Response.json(balances(0, 0)));
  render(<Checkout locale="ko" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("결제가 완료되지 않았어요.");
  expect(calls.map((c) => c.action)).toEqual(["balances"]);
  expect(sessionStorage.getItem("chemi-point-order")).toBeNull();
});

it("rechecks a stored order and shows the cancellation or the review notice", async () => {
  sessionStorage.setItem("chemi-point-order", "order-1");
  let canceled = true;
  const calls = stubApi((body) =>
    body.action === "refresh"
      ? canceled
        ? Response.json({ status: "CANCELED", ...balances(3, 0) })
        : Response.json({ error: "POINT_REFUND_REVIEW" }, { status: 409 })
      : Response.json(balances(3, 100)),
  );
  render(<Checkout locale="ko" />);
  fireEvent.click(await screen.findByRole("button", { name: "결제 결과 다시 확인" }));
  expect(await screen.findByText("충전이 취소됐어요.")).toBeTruthy();
  canceled = false;
  fireEvent.click(screen.getByRole("button", { name: "결제 결과 다시 확인" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("쓴 포인트가 있어 취소를 반영하지 못했어요.");
  expect(calls.filter((c) => c.action === "refresh")).toHaveLength(2);
});
