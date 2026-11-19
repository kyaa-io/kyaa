"use client";
import { useEffect, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { DateShortage } from "./date-shortage";
import { parseNewFortune, todayKst, type FortuneReading } from "./reading";
import { flowNotes } from "./result-copy";
import styles from "./result.module.css";

export function DatePurchase({
  character,
  locale,
}: {
  character: string;
  locale: string;
}) {
  const { getAccessToken } = useByUsAuth();
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [quote, setQuote] = useState<{
    price: number;
    balance: number;
    topupPath?: string;
  }>();
  const [saved, setSaved] = useState<FortuneReading>();
  useEffect(() => {
    const day = new URLSearchParams(window.location.search).get("date");
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) setDay(day);
  }, []);
  function topupHref(path: string) {
    const back = new URL(window.location.href);
    back.searchParams.set("date", day);
    back.hash = "fortune-date";
    const params = new URLSearchParams({
      returnTo: back.pathname + back.search + back.hash,
      date: day,
      character,
    });
    return `${path}?${params}`;
  }
  function reset(value: string) {
    setDay(value);
    setQuote(undefined);
    setSaved(undefined);
    setError(false);
  }
  async function request(confirm: boolean) {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/chemi/fortune/date", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await getAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ day, character, confirm }),
      });
      const body = await response.json();
      if (
        !response.ok ||
        !Number.isSafeInteger(body.price) ||
        !Number.isSafeInteger(body.balance)
      )
        throw Error();
      const reading = parseNewFortune(body);
      if (body.readingId && !reading) throw Error();
      setQuote(body.todayFree ? undefined : body);
      setSaved(reading ?? undefined);
    } catch {
      setError(true);
      setQuote(undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="fortune-date" className={`${styles.panel} ${styles.purchase}`}>
      <FanHeading as="h2">다른 날짜의 운세</FanHeading>
      <label>
        운세를 볼 날짜
        <input
          type="date"
          value={day}
          disabled={busy}
          onChange={(event) => reset(event.target.value)}
        />
      </label>
      {day === todayKst() && (
        <FanText role="body">오늘의 풀이는 위에서 볼 수 있어요.</FanText>
      )}
      {error && (
        <p role="alert">
          운세를 불러오지 못했어요. 같은 날짜로 다시 확인해 주세요.
        </p>
      )}
      {saved && !saved.result.locked ? (
        <div aria-live="polite">
          <FanText role="item">
            {saved.kstDate.replaceAll("-", ".")} · {saved.result.grade.name}
          </FanText>
          <p>{flowNotes[saved.result.grade.name]}</p>
          <p>운세 {saved.result.score}점</p>
          <p>행운의 색 {saved.result.luck.color} · 행운의 숫자 {saved.result.luck.number}</p>
        </div>
      ) : quote ? (
        <div aria-live="polite">
          <p>
            가격 {quote.price}P · 현재 잔액 {quote.balance}P
          </p>
          {quote.balance >= quote.price ? (
            <>
              <p>구매 후 잔액 {quote.balance - quote.price}P</p>
              <div className={`${styles.purchaseActions} ${styles.purchaseConfirm}`}>
                <FanAction
                  variant="primary"
                  size="lg"
                  disabled={busy}
                  onClick={() => request(true)}
                >
                  {quote.price}P로 운세 열기
                </FanAction>
                <FanAction variant="text" disabled={busy} onClick={() => reset("")}>
                  취소
                </FanAction>
              </div>
            </>
          ) : (
            <DateShortage
              shortBy={quote.price - quote.balance}
              topupHref={quote.topupPath ? topupHref(quote.topupPath) : undefined}
              locale={locale}
              busy={busy}
              onCancel={() => reset("")}
            />
          )}
        </div>
      ) : (
        <FanAction
          disabled={!day || busy}
          onClick={() => request(false)}
        >
          {day === todayKst() ? "이 날짜의 구매 기록 확인" : "가격 확인"}
        </FanAction>
      )}
    </section>
  );
}
