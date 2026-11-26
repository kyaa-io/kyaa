"use client";
import { formatMileage } from "@/i18n/format-mileage";
import { useReadingBirthCopy, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { ReadingText } from "@/features/chemi/i18n/reading-ui";
import { useEffect, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { birthIsoToText, birthTextToIso, daysInMonth } from "@/features/chemi/domain/birth-form";
import { BirthDateField } from "@/features/chemi/ui/frame/birth-fields";
import { DateShortage } from "./date-shortage";
import { parseNewFortune, todayKst, type FortuneReading } from "./reading";
import { flowNotes } from "./result-copy";
import { luckValue } from "./deep/copy";
import type { AppLocale } from "@/i18n/locales";
import styles from "./result.module.css";

/** 숫자 8자리(YYYY.MM.DD)가 실제 있는 날짜면 YYYY-MM-DD, 아니면 null. */
function dayOf(text: string) {
  const iso = birthTextToIso(text);
  if (!iso) return null;
  const [year, month, date] = iso.split("-").map(Number);
  return year >= 1900 && month >= 1 && month <= 12 && date >= 1 && date <= daysInMonth(year, month) ? iso : null;
}

export function DatePurchase({
  character,
  locale,
}: {
  character: string;
  locale: string;
}) {
  const uiText = useReadingCopy();
  const birthCopy = useReadingBirthCopy();
  const { getAccessToken } = useByUsAuth();
  // 날짜는 숫자 8자리 글(YYYY.MM.DD)로 쥐고, 다 채워진 실제 날짜일 때만 day 가 생긴다.
  const [text, setText] = useState("");
  const day = dayOf(text) ?? "";
  const [standardPrice, setStandardPrice] = useState<number>();
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
    const controller = new AbortController();
    void fetch("/api/chemi/fortune/date", { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!controller.signal.aborted && Number.isSafeInteger(data?.price) && data.price >= 0) setStandardPrice(data.price);
      }).catch(() => {});
    const day = new URLSearchParams(window.location.search).get("date");
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) setText(birthIsoToText(day));
    return () => controller.abort();
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
    setText(value);
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
      <FanHeading as="h2">{uiText("anotherDate")}{standardPrice !== undefined && ` · ${formatMileage(standardPrice, locale)}`}</FanHeading>
      <BirthDateField
        label={uiText("date")}
        value={text}
        onChange={reset}
        error={text.length === 10 && !day ? birthCopy.invalidDate : null}
        copy={birthCopy}
        disabled={busy}
        wheel={{ title: uiText("date"), fromYear: Number(todayKst().slice(0, 4)) - 1, years: 3, start: todayKst() }}
      />
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
          <p>{uiText("luckyPair", { color: luckValue(saved.result.luck.color, locale as AppLocale), number: saved.result.luck.number })}</p>
        </div>
      ) : quote ? (
        <div aria-live="polite">
          <p>
            {uiText("priceBalance", { price: formatMileage(quote.price, locale), balance: formatMileage(quote.balance, locale) })}
          </p>
          {quote.balance >= quote.price ? (
            <>
              <p>{uiText("afterPurchase", { balance: formatMileage(quote.balance - quote.price, locale) })}</p>
              <div className={`${styles.purchaseActions} ${styles.purchaseConfirm}`}>
                <FanAction
                  variant="primary"
                  size="lg"
                  disabled={busy}
                  onClick={() => request(true)}
                >
                  {uiText("openPaid", { price: formatMileage(quote.price, locale) })}
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
