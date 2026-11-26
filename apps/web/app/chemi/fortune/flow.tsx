"use client";

import { pillarLabel } from "@/app/chemi/saju/terms-i18n";
import { landscapeSrcSet } from "@/features/chemi/ui/scene-art";
import { SceneSound } from "@/features/chemi/ui/scene-sound";
import { expressionFor, SceneExpression } from "@/features/chemi/ui/scene-expression";
import { SceneVideo } from "@/features/chemi/ui/scene-video";
import { useReadingCopy, ReadingText, ReadingTitle } from "@/features/chemi/i18n/reading-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "@/components/fan-ui/fan-icons";
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
  fortuneChoiceKey,
  fortuneChoiceLabel,
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
import { gradeKey, luckValue } from "./deep/copy";
import { AskScene } from "@/features/chemi/ask/ask-scene";
import { exitFortune } from "./exit";
import { askGo, useAskLocation } from "@/features/chemi/ask/location";
import { FortuneResult } from "./result";
import { Under14 } from "./under-14";
import styles from "./scene.module.css";
import { creatorName } from "@/features/fanpage/domain/creator-names";
import { useChemiNickname } from "@/features/chemi/use-chemi-nickname";

const art = "/chemi/fortune";
const talkChoice = [
  "tellMore",
  "whatFandom",
  "whatBring",
  "dailySummary",
] as const;
const mobileTalkArt = ["portrait", "calm", "laugh", "care"] as const;
/**
 * 입장 화면의 사진 → 캐릭터 변신 영상 판(`<최애>-photo-to-character-<판>`, 휴대폰 첫 입장에 한 번). 끝 프레임이 지금 입장 그림과 같은 것만 넣는다.
 * 영상은 세로 원화와 같은 2:3 이라 정지 그림과 같은 자리에 겹친다. 도사는 사진이 없어 비운다.
 */
const photoToCharacter: Partial<Record<FortuneCharacterId, string>> = { changha: "v1", elina: "v2", yuna: "v2" };

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

function writeUrl(patch: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch))
    value === null ? params.delete(key) : params.set(key, value);
  const url = `${window.location.pathname}?${params}`;
  window.history.replaceState(window.history.state, "", url);
}



function seoulDate(
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions,
  at: number,
) {
  return new Intl.DateTimeFormat(locale, { timeZone: "Asia/Seoul", ...options }).format(at);
}

/** 결과 본문(오늘의 흐름·분야 풀이)을 고른 최애 말투로 쓰도록 근거에 최애를 붙인다(fortune/depth.ts). */
function voicedReading(reading: FortuneReading, character: FortuneCharacterId): FortuneReading {
  if (reading.result.locked) return reading;
  const evidence = { ...reading.result.evidence, voice: character };
  return { ...reading, result: { ...reading.result, evidence } };
}

export function FortuneFlow({
  locale,
  restoring: restoringFromUrl = false,
  paidPreview = false,
}: {
  locale: AppLocale;
  /** DEV 시험 모드에서만 결과의 날짜 지정(포인트)을 보인다. */
  paidPreview?: boolean;
  /** 주소에 단계와 결과가 있어 저장된 결과를 불러오는 중이면 입장 화면 대신 불러오는 모양을 그린다. */
  restoring?: boolean;
}) {
  const text = useReadingCopy();
  const ask = useAskLocation();
  const { ready, authenticated, getAccessToken, login } = useByUsAuth();
  const nickname = useChemiNickname();
  // 대화 줄은 한국어 표라 별명도 한국어 화면에서만 부른다(다른 언어는 공통 글자).
  const koNickname = locale === "ko" ? nickname : null;
  const [step, setStep] = useState<FortuneStep>("enter");
  const [picked, setPicked] = useState<"fandom" | "luck" | null>(null);
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
  const abort = useRef<AbortController | null>(null);
  /** 화면에 있는 `reading`을 받은 최애. 주소의 최애와 다르면 그 결과는 이 주소의 것이 아니다. */
  const readingOf = useRef<FortuneCharacterId | null>(null);
  // 결과 화면은 받은 풀이가 바뀔 때만 다시 그리므로 같은 객체를 넘긴다.
  const voiced = useMemo(() => reading && voicedReading(reading, character), [reading, character]);

  const day = kstDayStart(reading?.kstDate);
  const name = creatorName(character, locale);

  // 첫 진입: 주소의 단계·최애를 읽는다. 결과가 없으면 입장으로 돌린다.
  useEffect(() => {
    async function restore(
      readingId: string,
      id: FortuneCharacterId,
      target: FortuneStep,
    ) {
      if (!ready) return;
      if (!authenticated) {
        writeUrl({ step: null, r: null });
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
        writeUrl({ step: null, r: null });
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
        writeUrl({ step: null, r: null });
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
        writeUrl({ step: "talk-1", r: data.readingId });
        setStep("talk-1");
      } catch (error) {
        // 다른 단계로 떠났거나 새 요청이 이어받은 요청의 끝은 화면에 반영하지 않는다.
        if (abort.current !== controller) return;
        if (error instanceof ChemiRequestError && error.code === "CHEMI_BIRTH_REQUIRED") {
          writeUrl({ step: null });
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
      if (window.location.pathname !== "/chemi/fortune") return;
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
          writeUrl({ step: null });
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
        writeUrl({ step: next === "enter" ? null : next, r: shown?.readingId ?? null });
      setStep(next);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [reading, authenticated, run]);

  function start() {
    if (!authenticated) return setSheet("login");
    writeUrl({ step: "calc", c: character });
    setStep("calc");
    void run(character);
  }

  async function saveBirthAndGo(birth: BirthInput) {
    setBirthBusy(true);
    setBirthError(null);
    try {
      await saveBirth(await getAccessToken(), birth);
      setSheet(null);
      writeUrl({ step: "calc", c: character });
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

  function choose(id: FortuneCharacterId) {
    setCharacter(id);
    writeUrl({ c: id });
  }

  function openResult() {
    writeUrl({ step: "result", r: reading?.readingId ?? null, c: character });
    setStep("result");
  }

  function advance() {
    const talk = talkNumber(step);
    if (talk === 4) return openResult();
    const next = nextFortuneStep(step);
    writeUrl({ step: next });
    setStep(next);
  }

  /** 대화의 두 번째 선택지: 바로 다음 이야기를 건너뛰고 그다음 이야기를 먼저 듣는다(마지막 앞에서는 정리로 간다). */
  function skipAhead() {
    const talk = talkNumber(step);
    if (!talk || talk >= 3) return openResult();
    // 고른 이야기를 기억한다: 최애가 그 선택을 받아 말하고, 결과에서 그 칸이 펼쳐진 채 열린다.
    setPicked(talk === 1 ? "fandom" : "luck");
    const next = `talk-${talk + 2}` as FortuneStep;
    writeUrl({ step: next });
    setStep(next);
  }

  if (under14) return <Under14 locale={locale} />;

  if (restoring)
    return <FortuneResult pending locale={locale} character={character} backHref={`/chemi?locale=${locale}`} />;

  if (step === "result" && reading && ask)
    return (
      <AskScene
        locale={locale}
        content="fortune"
        character={character}
        readingId={reading.readingId}
        at={ask}
        result={reading.result.locked ? undefined : text("scoreGrade", { score: reading.result.score, grade: locale === "ko" ? reading.result.grade.name : text(gradeKey(reading.result.score)) })}
      />
    );
  if (step === "result" && reading)
    return (
      <FortuneResult
        locale={locale}
        initial={voiced}
        character={character}
        backHref={`/chemi?locale=${locale}`}
        onAsk={() => askGo({ step: "result" })}
        paidPreview={paidPreview}
        focus={picked}
      />
    );

  const talk = talkNumber(step);
  const result = reading && !reading.result.locked ? reading.result : null;
  // 창하는 2~4단계마다 다른 원화(차분·웃음·챙김)가 이미 있어, 같은 구도의 원화를 쓰는 첫 단계에만 표정을 겹친다.
  const expression = !talk || !result || (character === "changha" && talk > 1) ? null
    : talk === 1 ? expressionFor.firstReveal
    : talk === 2 ? (result.fields.people >= 80 ? expressionFor.good : expressionFor.low)
    : talk === 3 ? (result.fields.fandom >= 80 ? expressionFor.good : expressionFor.low)
    : expressionFor.luck;
  const lineInput = result && {
    score: result.score,
    grade: result.grade.name,
    fandom: result.fields.fandom,
    money: result.fields.money,
    people: result.fields.people,
    luckyHour: result.luck.luckyHour,
    color: result.luck.color,
  };
  // 4/4 는 2/4 에서 건너뛰어 왔으면 그때의 보조 선택지, 아니면 3/4 의 강조 선택지를 누르고 온 장면이다.
  const lastAsk = talk === 4 && lineInput
    ? picked === "luck" ? fortuneChoiceKey(2, "skip", lineInput) : fortuneChoiceKey(3, "next", lineInput)
    : null;
  const entering = step === "enter" && !needBirth;
  const line =
    step === "calc"
      ? fortuneCalcLine(character)
      : talk && lineInput
        ? fortuneTalkLine(character, talk, lineInput, reading?.styled?.headline, picked, lastAsk)
        : needBirth
          ? fortuneEnterLine(character, koNickname, "birth")
          : koNickname
            ? fortuneEnterLine(character, koNickname)
            : text(`fortuneEnter_${character}`);

  const wideArt =
    character === "changha"
      ? `${art}/${talk ? "fortune-v1" : "fortune-changha-banner-v2"}.webp`
      : `${art}/fortune-${character}-wide-v2.webp`;
  const mobileArt =
    character === "changha"
      ? `${art}/${talk ? `fortune-${mobileTalkArt[talk - 1]}-v1` : "fortune-portrait-v2"}.webp`
      : `${art}/fortune-${character}-v2.webp`;
  const face =
    character === "changha" && talk && talk > 1
      ? `${art}/fortune-${mobileTalkArt[talk - 1]}-v1.webp`
      : null;

  // 입장에서는 '응, 봐 줘', 대화에서는 다음 말로 가는 강조 버튼 하나만 둔다.
  // 대화 선택지는 바로 앞 대사를 받아 묻는 말이고, 다음 대사가 그 답이 되도록 등급·점수 구간을 보고 고른다(lines.ts).
  // 한국어는 최애마다 다른 글자, 다른 언어는 같은 질문의 공통 글자(fortuneAsk_*)를 쓴다.
  const choiceLabel = (slot: "next" | "skip", key: (typeof talkChoice)[number]) => {
    const ask = talk && lineInput ? fortuneChoiceKey(talk, slot, lineInput) : null;
    if (!ask || !talk || !lineInput) return text(key);
    return locale === "ko" ? fortuneChoiceLabel(character, talk, slot, lineInput) ?? text(key) : text(`fortuneAsk_${ask}`);
  };
  const primaryLabel = entering ? text("readFortune") : talk ? choiceLabel("next", talkChoice[talk - 1]) : null;



  return (
    <div className={styles.page} data-fortune-flow={step}>
      <div className={styles.chips}>
        <FanAction
          variant="neutral"
          href={`/chemi?locale=${locale}`}
          ariaLabel={entering ? text("chemiExit") : text("back")}
          leadingIcon={<FanIcon icon={ChevronLeft} />}
          className={styles.round}
          onClick={exitFortune}
        />
        <SceneSound locale={locale} reveal={talk === 1 && expression !== null} />
        {step === "enter" ? (
          <>
            <div className={styles.pick} role="group" aria-label={text("favorite")}>
              {fortuneCharacters.filter(({ id }) => id !== "dosa").map((c) => (
                <FanAction
                  key={c.id}
                  variant="text"
                  className={styles.pickItem}
                  aria-pressed={c.id === character}
                  onClick={() => choose(c.id)}
                >
                  <img src={`${art}/avatar-${c.id}-v1.jpg`} alt="" />
                  <FanText role={c.id === character ? "label" : "meta"}>
                    {creatorName(c.id, locale)}
                  </FanText>
                </FanAction>
              ))}
            </div>
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
        <div className={styles.art}>
          <picture>
            <source media="(min-width: 48rem)" srcSet={landscapeSrcSet(wideArt)} />
            <img src={mobileArt} alt={text("cloudArt", { name })} />
          </picture>
          <SceneExpression
            scene="fortune"
            character={character}
            portrait={character === "changha" ? `${art}/fortune-portrait-v1.webp` : mobileArt}
            expression={expression}
          />
          {step === "enter" && photoToCharacter[character] && (
            <SceneVideo src={`/public-assets/cms-assets/chemi/video/${character}-photo-to-character-${photoToCharacter[character]}`} once mobileOnly objectPosition="center 25%" />
          )}
        </div>
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
                  · {text("pillarDay", { pillar: pillarLabel(result.evidence.dayPillar, locale) })}
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
                    [text("color"), luckValue(result.luck.color, locale)],
                    [text("number"), result.luck.number],
                    [text("direction"), luckValue(result.luck.direction, locale)],
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
                {talk && talk < 4 && (
                  <FanAction variant="neutral" onClick={skipAhead}>
                    {choiceLabel("skip", talkChoice[talk as 1 | 2 | 3])}
                  </FanAction>
                )}
              </div>
            )}
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
