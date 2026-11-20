"use client";

import { useReadingCopy, ReadingText, ReadingTitle } from "@/features/chemi/i18n/reading-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanGauge } from "@/components/fan-ui/fan-number";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import {
  nextFortuneStep,
  parseFortuneStep,
  reachableFortuneStep,
  talkNumber,
  type FortuneStep,
} from "@/features/chemi/domain/step";
import type { AppLocale } from "@/i18n/locales";
import { BirthSheet, type BirthInput } from "./birth-sheet";
import {
  fortuneCalcLine,
  fortuneCharacters,
  fortuneEnterLine,
  fortuneTalkLine,
  type FortuneCharacterId,
} from "./lines";
import {
  ChemiRequestError,
  isAuthFailure,
  loadParticipation,
  parseTodayFortune,
  requestFortune,
  saveBirth,
  type FortuneReading,
  type Participation,
} from "./reading";
import { kstDate, kstDayStart } from "./result-copy";
import { AskScene } from "@/features/chemi/ask/ask-scene";
import { askGo, useAskLocation } from "@/features/chemi/ask/location";
import { FortuneResult } from "./result";
import { Under14 } from "./under-14";
import styles from "./scene.module.css";

const art = "/chemi/fortune";
const talkChoice = [
  "tellMore",
  "whatFandom",
  "whatBring",
  "dailySummary",
] as const;
const mobileTalkArt = ["portrait", "calm", "laugh", "care"] as const;

type Phase = "idle" | "calc" | "error";
/** 오류 안내를 가른다: 로그인 만료, 서비스 거절, 연결 끊김. */
type Failure = "auth" | "service" | "network";
const failureTitle = {
  auth: "expired",
  service: "fortuneFailure",
  network: "offline",
} as const;
type Sheet = null | "login" | "birth";

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  const character = fortuneCharacters.find((c) => c.id === params.get("c"));
  return {
    step: parseFortuneStep(params.get("step")),
    character: character?.id ?? "changha",
    readingId: params.get("r"),
  };
}

/** 이 운세 흐름이 쌓은 기록 칸 수. 새 탭에서 복원한 주소는 0이다. */
function flowDepth() {
  const depth = (window.history.state as { fortuneDepth?: number } | null)?.fortuneDepth;
  return typeof depth === "number" ? depth : 0;
}

function writeUrl(
  patch: Record<string, string | null>,
  mode: "push" | "replace",
  /** replace 에서 기록 칸 수를 다시 센다(입장 주소로 되돌린 칸이 새 바닥이 될 때). */
  depth?: number,
) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch))
    value === null ? params.delete(key) : params.set(key, value);
  const url = `${window.location.pathname}?${params}`;
  if (mode === "push")
    window.history.pushState({ fortuneDepth: flowDepth() + 1 }, "", url);
  else
    window.history.replaceState(
      depth === undefined ? window.history.state : { fortuneDepth: depth },
      "",
      url,
    );
}



function seoulDate(
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions,
  at: number,
) {
  return new Intl.DateTimeFormat(locale, { timeZone: "Asia/Seoul", ...options }).format(at);
}

export function FortuneFlow({
  locale,
  restoring: restoringFromUrl = false,
}: {
  locale: AppLocale;
  /** 주소에 단계와 결과가 있어 저장된 결과를 불러오는 중이면 입장 화면 대신 불러오는 모양을 그린다. */
  restoring?: boolean;
}) {
  const text = useReadingCopy();
  const ask = useAskLocation();
  const { ready, authenticated, getAccessToken, login } = useByUsAuth();
  const [step, setStep] = useState<FortuneStep>("enter");
  const [character, setCharacter] = useState<FortuneCharacterId>("changha");
  const [reading, setReading] = useState<FortuneReading>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<Failure>("network");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [needBirth, setNeedBirth] = useState(false);
  const [birthBusy, setBirthBusy] = useState(false);
  const [birthError, setBirthError] = useState<string | null>(null);
  const [under14, setUnder14] = useState(false);
  const [restoring, setRestoring] = useState(restoringFromUrl);
  const [participation, setParticipation] = useState<Participation>(null);
  const collapsing = useRef(false);
  const abort = useRef<AbortController | null>(null);
  /** 화면에 있는 `reading`을 받은 최애. 주소의 최애와 다르면 그 결과는 이 주소의 것이 아니다. */
  const readingOf = useRef<FortuneCharacterId | null>(null);

  const day = kstDayStart(reading?.kstDate);
  const index = fortuneCharacters.findIndex((c) => c.id === character);
  const name = fortuneCharacters[index].name;

  // 첫 진입: 주소의 단계·최애를 읽는다. 결과가 없으면 입장으로 돌린다.
  useEffect(() => {
    async function restore(
      readingId: string,
      id: FortuneCharacterId,
      target: FortuneStep,
    ) {
      if (!ready) return;
      if (!authenticated) {
        writeUrl({ step: null, r: null }, "replace");
        setRestoring(false);
        return;
      }
      try {
        const response = await fetch(
          `/api/chemi/readings/${encodeURIComponent(readingId)}?c=${id}`,
          { headers: { Authorization: `Bearer ${await getAccessToken()}` } },
        );
        const data = parseTodayFortune(await response.json().catch(() => null));
        if (!response.ok || !data) throw Error();
        readingOf.current = id;
        setReading({ ...data, readingId, replayed: true });
        setStep(reachableFortuneStep(target, true));
      } catch {
        writeUrl({ step: null, r: null }, "replace");
        setStep("enter");
        showFanToast({ title: text("fortuneMissing") });
      } finally {
        setRestoring(false);
      }
    }
    const url = readUrl();
    setCharacter(url.character);
    if (url.step !== "enter") {
      if (!url.readingId) {
        writeUrl({ step: null, r: null }, "replace");
        setRestoring(false);
        return;
      }
      void restore(url.readingId, url.character, url.step);
    }
    const controller = new AbortController();
    void loadParticipation(controller.signal)
      .then(setParticipation)
      .catch(() => {});
    return () => controller.abort();
    // 한 번만 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(
    async (id: FortuneCharacterId) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 15000);
      setPhase("calc");
      const started = Date.now();
      try {
        const data = await requestFortune(
          await getAccessToken(),
          id,
          controller.signal,
        );
        const wait = Math.max(0, 1200 - (Date.now() - started));
        await new Promise((resolve) => setTimeout(resolve, wait));
        if (abort.current !== controller) return;
        if (controller.signal.aborted) throw Error();
        readingOf.current = id;
        setReading(data);
        setPhase("idle");
        setNeedBirth(false);
        writeUrl({ step: "talk-1", r: data.readingId }, "replace");
        setStep("talk-1");
      } catch (error) {
        // 다른 단계로 떠났거나 새 요청이 이어받은 요청의 끝은 화면에 반영하지 않는다.
        if (abort.current !== controller) return;
        if (error instanceof ChemiRequestError && error.code === "CHEMI_BIRTH_REQUIRED") {
          writeUrl({ step: null }, "replace", 0);
          setStep("enter");
          setPhase("idle");
          setNeedBirth(true);
          setSheet("birth");
          return;
        }
        setFailure(
          timedOut || !(error instanceof ChemiRequestError)
            ? "network"
            : isAuthFailure(error)
              ? "auth"
              : "service",
        );
        setPhase("error");
      } finally {
        clearTimeout(timer);
      }
    },
    [getAccessToken],
  );

  // 브라우저 뒤로·앞으로 이동. 계산 중이던 기록으로 앞으로 오면 같은 요청을 다시 이어 간다.
  useEffect(() => {
    function onPop() {
      if (collapsing.current) return;
      // 계산 중에 떠나면 요청을 끊어, 늦게 온 응답이 화면을 끌고 가지 못하게 한다.
      abort.current?.abort();
      abort.current = null;
      const url = readUrl();
      setCharacter(url.character);
      setPhase("idle");
      // 이전 최애의 결과가 남아 있어도 주소의 최애 결과가 아니면 없는 것으로 본다.
      const shown = reading && readingOf.current === url.character ? reading : undefined;
      if (url.step === "calc" && !shown) {
        if (!authenticated) {
          writeUrl({ step: null }, "replace", 0);
          setStep("enter");
          return;
        }
        setStep("calc");
        void run(url.character);
        return;
      }
      const next = reachableFortuneStep(url.step, Boolean(shown));
      // 주소가 가리키는 단계와 보이는 단계가 다르면 주소를 보이는 단계에 맞춘다.
      if (next !== url.step)
        writeUrl({ step: next === "enter" ? null : next, r: shown?.readingId ?? null }, "replace");
      setStep(next);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [reading, authenticated, run]);

  function start() {
    if (!authenticated) return setSheet("login");
    writeUrl({ step: "calc", c: character }, "push");
    setStep("calc");
    void run(character);
  }

  async function saveBirthAndGo(birth: BirthInput) {
    setBirthBusy(true);
    setBirthError(null);
    try {
      await saveBirth(await getAccessToken(), birth);
      setSheet(null);
      writeUrl({ step: "calc", c: character }, "push");
      setStep("calc");
      void run(character);
    } catch (error) {
      if (error instanceof ChemiRequestError && error.code === "CHEMI_UNDER_14") {
        setSheet(null);
        setUnder14(true);
      } else {
        setBirthError(text("saveFailed"));
      }
    } finally {
      setBirthBusy(false);
    }
  }

  function choose(next: number) {
    const id = fortuneCharacters[(next + fortuneCharacters.length) % fortuneCharacters.length].id;
    setCharacter(id);
    writeUrl({ c: id }, "replace");
  }

  /** 결과로 들어갈 때 대화 칸들을 접어, 뒤로 가면 입장이 되게 한다. */
  function openResult() {
    const keep = { r: reading?.readingId ?? null, c: character };
    const depth = flowDepth();
    // 새 탭에서 복원해 쌓은 칸이 없으면 접을 것이 없다. 지금 칸을 결과로 바꾼다.
    if (depth === 0) {
      writeUrl({ step: "result", ...keep }, "replace");
      setStep("result");
      return;
    }
    collapsing.current = true;
    const reset = () => {
      window.removeEventListener("popstate", reset);
      writeUrl({ step: "result", ...keep }, "push");
      collapsing.current = false;
      setStep("result");
    };
    window.addEventListener("popstate", reset);
    window.history.go(-depth);
  }

  function advance() {
    const talk = talkNumber(step);
    if (talk === 4) return openResult();
    const next = nextFortuneStep(step);
    writeUrl({ step: next }, "push");
    setStep(next);
  }

  if (under14) return <Under14 locale={locale} />;

  if (restoring)
    return <FortuneResult pending locale={locale} character={character} backHref={`/chemi?locale=${locale}`} />;

  if (step === "result" && reading && ask)
    return <AskScene locale={locale} content="fortune" character={character} readingId={reading.readingId} at={ask} />;
  if (step === "result" && reading)
    return (
      <FortuneResult
        locale={locale}
        initial={reading}
        character={character}
        backHref={`/chemi/fortune?c=${character}&locale=${locale}`}
        onAsk={() => askGo({ step: "topic" })}
      />
    );

  const talk = talkNumber(step);
  const result = reading && !reading.result.locked ? reading.result : null;
  const lineInput = result && {
    score: result.score,
    grade: result.grade.name,
    fandom: result.fields.fandom,
    money: result.fields.money,
    people: result.fields.people,
    luckyHour: result.luck.luckyHour,
    color: result.luck.color,
  };
  const entering = step === "enter" && !needBirth;
  const line =
    step === "calc"
      ? fortuneCalcLine(character)
      : talk && lineInput
        ? fortuneTalkLine(character, talk, lineInput, reading?.styled?.headline)
        : fortuneEnterLine(character, null, needBirth ? "birth" : "enter");

  const wideArt =
    character === "changha" ? `${art}/fortune-v1.webp` : `${art}/fortune-${character}-wide-v2.webp`;
  const mobileArt =
    character === "changha"
      ? `${art}/fortune-${talk ? mobileTalkArt[talk - 1] : "portrait"}-v1.webp`
      : `${art}/fortune-${character}-v2.webp`;
  const face =
    character === "changha" && talk && talk > 1
      ? `${art}/fortune-${mobileTalkArt[talk - 1]}-v1.webp`
      : null;

  // 입장에서는 '응, 봐 줘', 대화에서는 다음 말로 가는 강조 버튼 하나만 둔다.
  const primaryLabel = entering ? text("readFortune") : talk ? text(talkChoice[talk - 1]) : null;

  const turns = (cls: string, side = false) => (
    <>
      <FanAction
        variant="neutral"
        className={side ? `${cls} ${styles.prev}` : cls}
        ariaLabel={text("prevStar")}
        leadingIcon={<FanIcon icon={ChevronLeft} />}
        onClick={() => choose(index - 1)}
      />
      <FanAction
        variant="neutral"
        className={side ? `${cls} ${styles.next}` : cls}
        ariaLabel={text("nextStar")}
        leadingIcon={<FanIcon icon={ChevronRight} />}
        onClick={() => choose(index + 1)}
      />
    </>
  );

  return (
    <div className={styles.page} data-fortune-flow={step}>
      <div className={styles.chips}>
        {step === "enter" ? (
          <FanAction
            variant="neutral"
            href={`/chemi?locale=${locale}`}
            ariaLabel={text("chemiExit")}
            leadingIcon={<FanIcon icon={ChevronLeft} />}
            className={styles.round}
          />
        ) : (
          <FanAction
            variant="neutral"
            ariaLabel={text("back")}
            leadingIcon={<FanIcon icon={ChevronLeft} />}
            className={styles.round}
            onClick={() => window.history.back()}
          />
        )}
        {step === "enter" ? (
          <>
            <div className={styles.pick} role="group" aria-label={text("favorite")}>
              {fortuneCharacters.map((c) => (
                <FanAction
                  key={c.id}
                  variant="text"
                  className={styles.pickItem}
                  aria-pressed={c.id === character}
                  onClick={() => choose(fortuneCharacters.indexOf(c))}
                >
                  <img src={`${art}/avatar-${c.id}-v1.jpg`} alt="" />
                  <FanText role={c.id === character ? "label" : "meta"}>
                    {c.name}
                  </FanText>
                </FanAction>
              ))}
            </div>
            <span className={styles.turnRow}>{turns(styles.round)}</span>
          </>
        ) : (
          <>
            <FanText role="label" className={styles.nameChip}>
              {name}
            </FanText>
            {talk && (
              <FanText as="time" role="meta">
                {kstDate(day)}
              </FanText>
            )}
            {talk && (
              <FanAction
                variant="text"
                className={styles.skip}
                onClick={openResult}
              >
                <ReadingText id="skip" />
              </FanAction>
            )}
          </>
        )}
      </div>
      <div className={styles.stage}>
        <picture className={styles.art}>
          <source media="(min-width: 48rem)" srcSet={wideArt} />
          <img src={mobileArt} alt={text("cloudArt", { name })} />
        </picture>
        {step === "enter" && <span className={styles.turnStage}>{turns(styles.turn, true)}</span>}
        {phase === "error" ? (
          <FanState
            inline
            kind={failure === "auth" ? "auth" : "error"}
            title={text(failureTitle[failure])}
            actions={
              failure === "auth" ? (
                <FanAction size="sm" onClick={login}>
                  <ReadingText id="login" />
                </FanAction>
              ) : (
                <FanAction size="sm" onClick={() => void run(character)}>
                  <ReadingText id="retry" />
                </FanAction>
              )
            }
          />
        ) : (
          <div className={styles.controls}>
            {entering && (
              <div className={styles.title}>
                <FanHeading as="h1"><ReadingTitle id="fortune" /></FanHeading>
                {participation && (
                  <FanText role="meta">{text(`${participation.period}Views`, { count: participation.count.toLocaleString(locale) })}</FanText>
                )}
              </div>
            )}
            {talk === 1 && result && (
              <div className={styles.card}>
                <div className={styles.score}>
                  <FanNumber size="xl" locale={locale} value={result.score} />
                  <FanHeading as="h2">{result.grade.name}</FanHeading>
                </div>
                <FanText role="meta">
                  {seoulDate(locale, { month: "long", day: "numeric", weekday: "long" }, day)}{" "}
                  · {text("pillarDay", { pillar: result.evidence.dayPillar })}
                </FanText>
                {reading?.styled?.headline && (
                  <FanText role="item">{reading.styled.headline}</FanText>
                )}
              </div>
            )}
            {talk === 3 && result && (
              <div className={styles.rows}>
                {(
                  [
                    [text("fandom"), result.fields.fandom],
                    [text("money"), result.fields.money],
                  ] as const
                ).map(([label, value]) => (
                  <div className={styles.row} key={label}>
                    <FanText role="meta">{label}</FanText>
                    <FanNumber locale={locale} value={value} />
                    <FanGauge label={label} max={100} value={value} />
                  </div>
                ))}
              </div>
            )}
            {talk === 4 && result && (
              <dl className={styles.luck}>
                {(
                  [
                    [text("color"), result.luck.color],
                    [text("number"), result.luck.number],
                    [text("direction"), result.luck.direction],
                    [
                      text("luckyTime"),
                      result.luck.luckyHour &&
                        text("hourRange", { start: result.luck.luckyHour.start, end: result.luck.luckyHour.end }),
                    ],
                  ] as const
                ).map(
                  ([label, value]) =>
                    value != null && (
                      <div key={label}>
                        <FanText as="dt" role="meta">
                          {label}
                        </FanText>
                        <FanText as="dd" role="item">
                          {value}
                        </FanText>
                      </div>
                    ),
                )}
              </dl>
            )}
            {primaryLabel && (
              <div className={styles.choices}>
                {entering && (
                  <FanAction variant="neutral" href={`/chemi?locale=${locale}`}>
                    {text("later")}</FanAction>
                )}
                <FanAction
                  variant="primary"
                  disabled={entering && !ready}
                  onClick={() => (entering ? start() : advance())}
                >
                  {primaryLabel}
                </FanAction>
              </div>
            )}
            <section className={styles.dialog} aria-live="polite">
              <p className={styles.who} data-face={face ? "" : undefined}>
                {face && <img className={styles.face} src={face} alt="" />}
                <FanText as="strong" role="item">
                  {name}
                </FanText>
                {talk && <FanText role="meta">{talk}/4</FanText>}
              </p>
              <FanText as="p" role="body">
                {line}
                {step === "calc" && (
                  <span className={styles.dots} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </FanText>
            </section>
          </div>
        )}
      </div>
      <FanDialog
        open={sheet === "login"}
        onOpenChange={(open) => !open && setSheet(null)}
        title={text("login")}
        size="sm"
        closeLabel={text("close")}
        primary={{ label: text("loginContinue"), onClick: login }}
      >
        <FanText as="p" role="body">
          <ReadingText id="fortuneLogin" />
        </FanText>
      </FanDialog>
      <BirthSheet
        open={sheet === "birth"}
        busy={birthBusy}
        error={birthError}
        onClose={() => setSheet(null)}
        onSave={saveBirthAndGo}
      />
    </div>
  );
}
