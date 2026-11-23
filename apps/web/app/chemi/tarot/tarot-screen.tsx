"use client";

import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { ReadingText } from "@/features/chemi/i18n/reading-ui";
import { untypedRouter } from "@/lib/navigation/untyped";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { FanSkeleton, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { ChevronLeft } from "@/components/fan-ui/fan-icons";
import type { AppLocale } from "@/i18n/locales";
import { isTarotCharacter, tarotCharacter, type TarotCharacter } from "@/features/chemi/tarot/script";
import { AskScene } from "@/features/chemi/ask/ask-scene";
import { askGo, useAskLocation } from "@/features/chemi/ask/location";
import { Pickband, TarotStage } from "./tarot-stage";
import { TarotResult } from "./tarot-result";
import { useTarotMeaning } from "./use-tarot-meaning";
import {
  AFTER_DRAW,
  BEFORE_DRAW,
  isTarotStep,
  kstDate,
  tarotUrl,
  type TarotAuth,
  type TarotDraw,
  type TarotStep,
} from "./types";
import styles from "./tarot.module.css";

const subscribeMedia = (query: string) => (notify: () => void) => {
  const list = matchMedia(query);
  list.addEventListener("change", notify);
  return () => list.removeEventListener("change", notify);
};
function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => subscribeMedia(query)(notify),
    () => matchMedia(query).matches,
    () => false,
  );
}

type Reading = { cards?: { card: number; reversed: boolean }[]; card?: number; reversed?: boolean };
const firstCard = (result: Reading | null | undefined) =>
  result?.cards?.[0] ?? (typeof result?.card === "number" ? { card: result.card, reversed: Boolean(result.reversed) } : null);

export function TarotScreen({
  locale,
  initialCharacter,
  initialStep,
  initialReading = null,
}: {
  locale: AppLocale;
  initialCharacter: TarotCharacter;
  initialStep: TarotStep;
  /** 결과 링크의 `r`. 날짜가 바뀐 뒤에도 그날 받은 결과를 다시 연다. */
  initialReading?: string | null;
}) {
  const uiText = useReadingCopy();
  const ask = useAskLocation();
  const router = useRouter();
  const { ready, authenticated, getAccessToken, login } = useByUsAuth();
  const auth: TarotAuth = { ready, authenticated, getAccessToken, login };
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const [character, setCharacter] = useState(initialCharacter);
  const [step, setStep] = useState<TarotStep>(initialStep);
  const [boot, setBoot] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [today, setToday] = useState<TarotDraw | null>(null);
  const [draw, setDraw] = useState<TarotDraw | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [drawAttempt, setDrawAttempt] = useState(0);
  // 세 장 배열을 이미 봤는지(첫 1번 무료). 모르는 동안에는 입구를 그리지 않는다.
  const [spreadUsed, setSpreadUsed] = useState<boolean | null>(null);
  const member = authenticated;
  const shown = member ? (draw ?? today) : draw;
  const meaning = useTarotMeaning(shown?.card ?? null);

  // 최신 값을 기록 이벤트(popstate)와 시간 지연 콜백이 읽는다.
  const latest = useRef({ shown, member, character, slot });
  useLayoutEffect(() => {
    latest.current = { shown, member, character, slot };
  });
  const fold = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headers = useCallback(async () => ({ Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json" }), [getAccessToken]);
  const authorize = useRef(headers);
  useLayoutEffect(() => {
    authorize.current = headers;
  });

  useEffect(() => {
    if (!ready || !authenticated) return;
    const controller = new AbortController();
    void (async () => {
      const response = await fetch("/api/chemi/tarot/spread", { headers: await authorize.current(), signal: controller.signal });
      if (!response.ok) return;
      const body = (await response.json()) as { readingId?: string | null };
      if (!controller.signal.aborted) setSpreadUsed(Boolean(body.readingId));
    })().catch(() => {});
    return () => controller.abort();
  }, [ready, authenticated]);

  // 오늘 이미 뽑은 카드(회원만): 목록 → 자세히. 서버가 같은 날 같은 카드를 지킨다.
  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setToday(null);
      setBoot("ready");
      return;
    }
    const controller = new AbortController();
    const signal = controller.signal;
    setBoot("loading");
    void (async () => {
      const day = kstDate();
      const authorization = await authorize.current();
      // 결과 링크로 열면 날짜 제한 없이 찾아 그 읽기의 날짜를 쓴다. 내 읽기가 아니면 오늘 카드로 되돌아간다.
      const range = initialReading ? "" : `&from=${day}&to=${day}`;
      const list = await fetch(`/api/chemi/readings?content=tarot${range}`, { headers: authorization, signal });
      if (!list.ok) throw new Error("list");
      const items = ((await list.json()) as { readingId: string; kind: string; date: string }[]).filter((item) => item.kind === "daily");
      const saved = items.find((item) => item.readingId === initialReading) ?? items.find((item) => item.date === day);
      if (!saved) {
        if (!signal.aborted) setToday(null);
        return;
      }
      const detail = await fetch(`/api/chemi/readings/${saved.readingId}`, { headers: authorization, signal });
      if (!detail.ok) throw new Error("detail");
      const card = firstCard(((await detail.json()) as { result?: Reading }).result);
      if (!card) throw new Error("card");
      if (!signal.aborted)
        setToday({ ...card, slot: null, date: saved.date, readingId: saved.readingId, replayed: true, reward: {}, settle: saved.date === day });
    })()
      .then(() => !signal.aborted && setBoot("ready"))
      .catch(() => !signal.aborted && setBoot("error"));
    return () => controller.abort();
  }, [ready, authenticated, attempt, initialReading]);

  const go = useCallback(
    (next: TarotStep, options: { replace?: boolean } = {}) => {
      const index = ((history.state?.tarot as number | undefined) ?? 0) + (options.replace ? 0 : 1);
      const url = tarotUrl({ locale, character: latest.current.character, step: next, reading: latest.current.shown?.readingId });
      if (options.replace) history.replaceState({ tarot: index }, "", url);
      else history.pushState({ tarot: index }, "", url);
      setStep(next);
    },
    [locale],
  );

  // 갈 수 없는 단계는 갈 수 있는 가장 가까운 단계로 고친다. 오늘 카드가 있으면 뽑기 전 화면은 '다시 온 장면'이다.
  const normalize = useCallback((requested: TarotStep): TarotStep => {
    const { shown: card, member: signedIn, slot: picked } = latest.current;
    if (AFTER_DRAW.has(requested) && !card) return "enter";
    if (BEFORE_DRAW.has(requested) && signedIn && card) return "enter";
    if (requested === "lock" && picked === null) return "pick";
    return requested;
  }, []);

  useEffect(() => {
    history.replaceState({ tarot: history.state?.tarot ?? 0 }, "");
    const onPop = () => {
      if (fold.current) {
        clearTimeout(fold.current);
        fold.current = null;
        go("result");
        return;
      }
      const params = new URLSearchParams(location.search);
      const requested = params.get("step");
      const key = params.get("c");
      if (isTarotCharacter(key)) setCharacter(key);
      setStep(normalize(isTarotStep(requested) ? requested : "enter"));
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [go, normalize]);

  // 처음 열린 단계가 갈 수 없는 단계면(새로 고침·직접 열기) 고친다. 오늘 카드를 알기 전에는 고치지 않는다.
  useEffect(() => {
    if (boot !== "ready") return;
    const fixed = normalize(step);
    if (fixed !== step) {
      setStep(fixed);
      history.replaceState({ tarot: history.state?.tarot ?? 0 }, "", tarotUrl({ locale, character, step: fixed, reading: shown?.readingId }));
    }
    // 단계가 바뀔 때마다 고치지 않는다: 뽑기 흐름은 카드를 얻은 뒤에 다음 단계로 간다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot]);

  // 섞기: 약 1.5초 뒤 고르기로(기록에 남기지 않는다). 움직임 줄이기는 기다리지 않는다.
  useEffect(() => {
    if (step !== "shuffle") return;
    const timer = setTimeout(() => go("pick", { replace: true }), reduced ? 0 : 1500);
    return () => clearTimeout(timer);
  }, [step, reduced, go]);

  // 카드 확정: 고른 자리의 카드를 서버가 정한다(회원은 그날의 섞인 덱에서 그 자리, 비회원은 저장 없이 한 장). 약 0.9초 뒤 뒤집기로.
  useEffect(() => {
    if (step !== "lock" || slot === null) return;
    const controller = new AbortController();
    const started = Date.now();
    setOffline(false);
    void (async () => {
      const response = await fetch("/api/chemi/readings", {
        method: "POST",
        headers: member ? await authorize.current() : { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ content: "tarot", kind: "daily", character, position: slot - 1 }),
      });
      const data = (await response.json()) as { result?: Reading; readingId?: string | null; replayed?: boolean; reward?: TarotDraw["reward"] };
      const card = firstCard(data.result);
      if (!response.ok || !card) throw new Error("draw");
      const wait = reduced ? 0 : Math.max(0, 900 - (Date.now() - started));
      await new Promise((resolve) => setTimeout(resolve, wait));
      if (controller.signal.aborted) return;
      const next: TarotDraw = {
        ...card,
        slot,
        date: kstDate(),
        readingId: data.readingId ?? null,
        replayed: Boolean(data.replayed),
        reward: data.reward ?? {},
        settle: false,
      };
      latest.current = { ...latest.current, shown: next };
      setDraw(next);
      go("flip", { replace: true });
    })().catch(() => !controller.signal.aborted && setOffline(true));
    return () => controller.abort();
    // 최애를 고른 뒤에는 이 자리의 최애가 바뀌지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, slot, drawAttempt, member]);

  const pick = (position: number) => {
    setSlot(position + 1);
    go("lock");
  };
  const selectCharacter = (key: TarotCharacter) => {
    latest.current = { ...latest.current, character: key };
    setCharacter(key);
    history.replaceState(history.state, "", tarotUrl({ locale, character: key, step, reading: shown?.readingId }));
  };
  const back = () => {
    const index = (history.state?.tarot as number | undefined) ?? 0;
    if (index > 0) history.back();
    else untypedRouter(router).push(`/chemi?locale=${locale}`);
  };
  // 결과 → 고르기: 결과로 오는 길의 장면 기록을 접어 결과의 바로 앞 칸이 입장 장면이 되게 한다.
  const openResult = () => {
    const index = (history.state?.tarot as number | undefined) ?? 0;
    if (index <= 0) return go("result");
    // 되돌아가는 기록 이동이 끝나면(popstate) 결과를 연다. 이동 신호가 끝내 안 오면 3초 뒤 그 자리에서 연다.
    fold.current = setTimeout(() => {
      fold.current = null;
      go("result");
    }, 3000);
    history.go(-index);
  };
  const advance = () => {
    if (step === "flip") go("talk2");
    else if (step === "talk2") go("talk3");
  };

  if (boot === "error")
    return (
      <div className={styles.root}>
        <FanState
          kind="error"
          title={uiText("offline")}
          actions={
            <FanAction size="sm" onClick={() => setAttempt((value) => value + 1)}>
              <ReadingText id="retry" />
            </FanAction>
          }
        />
      </div>
    );
  if (!ready || boot === "loading")
    return (
      <div className={styles.loading} role="status">
        <FanSkeletonStatus locale={locale} />
        <img src="/chemi/tarot/loading-dosa.webp" alt="" />
        <FanSkeleton shape="block" className={styles.loadbar} />
      </div>
    );

  const person = tarotCharacter(character, locale);
  const result = step === "result" && shown;
  if (result && ask && member && shown.readingId)
    return <AskScene locale={locale} content="tarot" character={character} readingId={shown.readingId} at={ask} />;
  return (
    <div className={styles.root} data-chemi-immersive={result ? undefined : ""} data-step={step}>
      <div className={styles.chips}>
        <FanIconButton aria-label={uiText("back")} className={styles.back} onClick={back}>
          <FanIcon icon={ChevronLeft} size={16} />
        </FanIconButton>
        {step === "enter" ? (
          <Pickband locale={locale} character={character} onSelect={selectCharacter} />
        ) : (
          <span className={styles.who}>
            <FanText role="label">{person.name}</FanText>
          </span>
        )}
        {step === "flip" || step === "talk2" || step === "talk3" ? (
          <FanAction className={styles.skip} variant="text" onClick={openResult}>
            <ReadingText id="skip" />
          </FanAction>
        ) : null}
      </div>
      {result ? (
        <TarotResult
          locale={locale}
          character={character}
          draw={shown}
          member={member}
          auth={auth}
          meaning={meaning}
          headers={headers}
          onAsk={member && shown.readingId ? () => askGo({ step: "result" }) : undefined}
        />
      ) : (
        <TarotStage
          locale={locale}
          step={step}
          character={character}
          shown={shown && member ? shown : null}
          draw={shown}
          slot={slot}
          offline={offline}
          meaning={meaning}
          reduced={reduced}
          onSelectCharacter={selectCharacter}
          onStart={() => go("think")}
          onThought={() => go("shuffle")}
          onPick={pick}
          onAdvance={advance}
          onResult={step === "enter" ? () => go("result") : openResult}
          onRetry={() => (step === "lock" ? setDrawAttempt((value) => value + 1) : meaning.retry())}
          spread={spreadUsed === null ? undefined : { href: `/chemi/tarot/spread?locale=${locale}&c=${character}`, used: spreadUsed }}
        />
      )}
    </div>
  );
}
