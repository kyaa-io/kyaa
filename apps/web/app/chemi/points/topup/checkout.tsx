"use client";
import Script from "next/script";
import { useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanAction } from "@/components/fan-ui/fan-action";

type Toss = (key: string) => { requestPayment(method: string, order: Record<string, unknown>): Promise<void> };
export function Checkout() {
  const { getAccessToken } = useByUsAuth();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit() {
    setBusy(true);
    try {
      const url = new URL(location.href);
      const query = url.searchParams;
      if (query.has("failed")) {
        sessionStorage.removeItem("chemi-point-order");
        history.replaceState(null, "", location.pathname);
        setMessage("시험 결제가 완료되지 않았습니다. 다시 충전할 수 있습니다.");
        return;
      }
      const stored = sessionStorage.getItem("chemi-point-order");
      const confirm = query.has("paymentKey");
      const body = confirm ? { action: "confirm", paymentKey: query.get("paymentKey"), amount: Number(query.get("amount")), orderId: query.get("orderId") }
        : stored ? { action: "refresh", orderId: stored } : { action: "open" };
      const response = await fetch("/api/chemi/points/topup", { method: "POST", headers: { Authorization: "Bearer " + await getAccessToken(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw Error();
      const result = await response.json();
      if (body.action === "open") {
        const sdk = (window as Window & { TossPayments: Toss }).TossPayments(result.clientKey);
        sessionStorage.setItem("chemi-point-order", result.orderId);
        await sdk.requestPayment("카드", { orderId: result.orderId, orderName: result.orderName, amount: result.amount, successUrl: location.origin + location.pathname, failUrl: location.origin + location.pathname + "?failed=1" });
      } else {
        const balance = result.balances[0];
        setMessage((result.status === "DONE" ? "100P 충전 완료" : "충전 취소") + " · 활동 " + balance.activity_points + "P · 유료 " + balance.paid_points + "P · 합계 " + balance.total_points + "P");
        sessionStorage.removeItem("chemi-point-order");
        history.replaceState(null, "", location.pathname);
      }
    } catch {
      setMessage("결제 상태를 확인할 수 없습니다. 다시 확인해 주세요.");
    } finally { setBusy(false); }
  }
  return <main>
    <Script src="https://js.tosspayments.com/v1/payment" onReady={() => setReady(true)} onError={() => setMessage("결제창을 불러올 수 없습니다.")} />
    <FanHeading as="h1">시험 포인트 충전</FanHeading>
    <p>1,000원 · 유료 포인트 100P</p>
    <FanAction disabled={!ready || busy} onClick={submit}>충전 또는 결제 결과 확인</FanAction>
    <p role="status">{message}</p>
  </main>;
}
