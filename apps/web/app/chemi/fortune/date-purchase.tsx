"use client";
import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { ReadingText } from "@/features/chemi/i18n/reading-ui";
import { useEffect, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { DateShortage } from "./date-shortage";
import { parseNewFortune, todayKst, type FortuneReading } from "./reading";
import { flowNotes } from "./result-copy";
import styles from "./result.module.css";

// Standard price from chemi_point_date. The date-specific quote controls confirmation.
export const DATE_READING_PRICE = 3;

export function DatePurchase({
  character,
  locale,
}: {
  character: string;
  locale: string;
}) {
  const uiText = useReadingCopy();
  const { getAccessToken } = useByUsAuth();
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [quote, setQuote] = useState<{
    price: number;
    balance: number;
    topupPath?: string;
  }>();
  const [revisit, setRevisit] = useState(false);
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
    setRevisit(false);
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
      setRevisit(Boolean(reading && body.replayed));
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
      <FanHeading as="h2">{uiText("anotherDate")} · {DATE_READING_PRICE}P</FanHeading>
      <label>
        <ReadingText id="date" />
        <input
          type="date"
          value={day}
          disabled={busy}
          onChange={(event) => reset(event.target.value)}
        />
      </label>
      {day === todayKst() && (
        <FanText role="body"><ReadingText id="above" /></FanText>
      )}
      {error && (
        <p role="alert">
          <ReadingText id="dateFailure" />
        </p>
      )}
      {saved && !saved.result.locked ? (
        revisit ? (
          <FanAction onClick={() => setRevisit(false)}><ReadingText id="readDateAgain" /></FanAction>
        ) : <div aria-live="polite">
          <FanText role="item">
            {saved.kstDate.replaceAll("-", ".")} · {saved.result.grade.name}
          </FanText>
          <p>{flowNotes[saved.result.grade.name]}</p>
          <p>{uiText("fortuneScore", { score: saved.result.score })}</p>
          <p>{uiText("luckyPair", { color: saved.result.luck.color, number: saved.result.luck.number })}</p>
        </div>
      ) : quote ? (
        <div aria-live="polite">
          <p>
            {uiText("priceBalance", { price: quote.price, balance: quote.balance })}
          </p>
          {quote.balance >= quote.price ? (
            <>
              <p>{uiText("afterPurchase", { balance: quote.balance - quote.price })}</p>
              <div className={`${styles.purchaseActions} ${styles.purchaseConfirm}`}>
                <FanAction
                  variant="primary"
                  size="lg"
                  disabled={busy}
                  onClick={() => request(true)}
                >
                  {uiText("openPaid", { price: quote.price })}
                </FanAction>
                <FanAction variant="text" disabled={busy} onClick={() => reset("")}>
                  <ReadingText id="cancel" />
                </FanAction>
              </div>
            </>
          ) : (
            <DateShortage
              topupHref={quote.topupPath ? topupHref(quote.topupPath) : undefined}
              shortBy={quote.price - quote.balance}
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
          {day === todayKst() ? uiText("checkPurchase") : uiText("price")}
        </FanAction>
      )}
    </section>
  );
}
