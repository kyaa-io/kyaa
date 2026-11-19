"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanText } from "@/components/fan-ui/fan-text";
import { FortuneReturnLink } from "./return-link";
import styles from "./topup.module.css";

type Toss = (key: string) => {
  requestPayment(method: string, order: Record<string, unknown>): Promise<void>;
};
type Balance = { activity_points: number; paid_points: number; total_points: number };
const orderKey = "chemi-point-order";

export function Checkout({ locale }: { locale: string }) {
  const { getAccessToken } = useByUsAuth();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [balance, setBalance] = useState<Balance>();
  const [message, setMessage] = useState<{ text: string; alert: boolean }>();
  const started = useRef(false);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch("/api/chemi/points/topup", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + (await getAccessToken()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      return { ok: response.ok, result };
    },
    [getAccessToken],
  );

  const settle = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      try {
        const { ok, result } = await post(body);
        if (result?.error === "POINT_REFUND_REVIEW") {
          setMessage({ text: "쓴 포인트가 있어 취소를 반영하지 못했어요.", alert: true });
          return;
        }
        if (!ok) throw Error();
        setBalance(result.balances[0]);
        setMessage({
          text: result.status === "DONE" ? "100P가 충전됐어요." : "충전이 취소됐어요.",
          alert: false,
        });
        history.replaceState(null, "", location.pathname);
      } catch {
        setMessage({ text: "결제 상태를 확인하지 못했어요.", alert: true });
      } finally {
        setBusy(false);
      }
    },
    [post],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const query = new URLSearchParams(location.search);
    const stored = sessionStorage.getItem(orderKey);
    setPending(Boolean(stored));
    if (query.has("failed")) {
      sessionStorage.removeItem(orderKey);
      setPending(false);
      history.replaceState(null, "", location.pathname);
      setMessage({ text: "결제가 완료되지 않았어요.", alert: true });
    }
    if (query.has("paymentKey")) {
      void settle({
        action: "confirm",
        paymentKey: query.get("paymentKey"),
        amount: Number(query.get("amount")),
        orderId: query.get("orderId"),
      });
      return;
    }
    void post({ action: "balances" })
      .then(({ ok, result }) => ok && setBalance(result.balances[0]))
      .catch(() => undefined);
  }, [post, settle]);

  async function pay() {
    setBusy(true);
    setMessage(undefined);
    try {
      const { ok, result } = await post({ action: "open" });
      if (!ok) throw Error();
      const sdk = (window as unknown as { TossPayments: Toss }).TossPayments(result.clientKey);
      sessionStorage.setItem(orderKey, result.orderId);
      await sdk.requestPayment("카드", {
        orderId: result.orderId,
        orderName: result.orderName,
        amount: result.amount,
        successUrl: location.origin + location.pathname,
        failUrl: location.origin + location.pathname + "?failed=1",
      });
    } catch {
      setMessage({ text: "결제창을 열지 못했어요.", alert: true });
      setBusy(false);
    }
  }

  const rows: [string, number | undefined][] = [
    ["활동 포인트", balance?.activity_points],
    ["유료 포인트", balance?.paid_points],
  ];
  return (
    <div className={styles.page}>
      <Script
        src="https://js.tosspayments.com/v1/payment"
        onReady={() => setReady(true)}
        onError={() => setMessage({ text: "결제창을 불러오지 못했어요.", alert: true })}
      />
      <FanHeading as="h1">시험 포인트 충전</FanHeading>
      <section className={styles.panel} aria-label="포인트 충전">
        <dl className={styles.balances}>
          {rows.map(([label, value]) => (
            <div key={label}>
              <FanText as="dt" role="body">{label}</FanText>
              <dd><FanNumber value={value ?? 0} unit="P" locale={locale} countUp /></dd>
            </div>
          ))}
          <div>
            <FanText as="dt" role="item">합계</FanText>
            <dd><FanNumber value={balance?.total_points ?? 0} unit="P" size="lg" locale={locale} countUp /></dd>
          </div>
        </dl>
        <div className={styles.product}>
          <FanText role="item">유료 포인트 100P</FanText>
          <FanText role="item">1,000원</FanText>
        </div>
        <div className={styles.actions}>
          <FanAction variant="primary" disabled={!ready || busy} onClick={pay}>
            1,000원 결제하기
          </FanAction>
          {pending && (
            <FanAction
              disabled={busy}
              onClick={() => settle({ action: "refresh", orderId: sessionStorage.getItem(orderKey) })}
            >
              결제 결과 다시 확인
            </FanAction>
          )}
          <FortuneReturnLink />
        </div>
        {message && (
          <div role={message.alert ? "alert" : "status"} className={styles.message}>
            <FanText role="body">{message.text}</FanText>
          </div>
        )}
      </section>
    </div>
  );
}
