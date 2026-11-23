"use client";

import { expressionFor, SceneExpression } from "@/features/chemi/ui/scene-expression";
import { useReadingCopy, ReadingText, ReadingTitle } from "@/features/chemi/i18n/reading-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanState } from "@/components/fan-ui/fan-state";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { FanText } from "@/components/fan-ui/fan-text";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import {
  nextStarStep,
  parseStarStep,
  reachableStarStep,
  starTalkNumber,
  type StarStep,
} from "@/features/chemi/domain/star-step";
import type { AppLocale } from "@/i18n/locales";
import { BirthSheet, type BirthInput } from "./birth-sheet";
import { StarChart } from "./chart";
import {
  bestDomain,
  domainLabels,
  domainLine,
  domains,
  overallHeadline,
  pickReasons,
  reasonView,
  signNames,
  starBestLine,
  starCalcLine,
  starCharacters,
  starEnterLine,
  starPairLine,
  signGlyphs,
  starSignLine,
  starWhyLine,
  worstDomain,
  type StarCharacterId,
} from "./copy";
import { art } from "./parts";
import {
  ChemiRequestError,
  isAuthFailure,
  loadParticipation,
  parseTodayStar,
  requestStar,
  saveBirth,
  signList,
  type Participation,
  type StarReading,
} from "./reading";
import { AskScene } from "@/features/chemi/ask/ask-scene";
import { askGo, useAskLocation } from "@/features/chemi/ask/location";
import { StarResult, StarResultSkeleton } from "./result";
import { useChemiNickname } from "@/features/chemi/use-chemi-nickname";
import { StarRating } from "./stars";
import { Under14 } from "./under-14";
import styles from "./scene.module.css";
import { creatorName } from "@/features/fanpage/domain/creator-names";

const talkChoice = ["domains", "whyQuestion", "ourMatch", "starSummary"] as const;

type Phase = "idle" | "calc" | "error";
/** 오류 안내를 가른다: 로그인 만료, 서비스 거절, 연결 끊김. */
type Failure = "auth" | "service" | "network";
const failureTitle = {
  auth: "expired",
  service: "starFailure",
  network: "offline",
} as const;
type Sheet = null | "login" | "birth";

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  const character = starCharacters.find((c) => c.id === params.get("c"));
  return {
    step: parseStarStep(params.get("step")),
    character: character?.id ?? "changha",
    readingId: params.get("r"),
  };
}

/** 이 흐름이 쌓은 기록 칸 수. 새 탭에서 복원한 주소는 0이다. */
function flowDepth() {
  const depth = (window.history.state as { starDepth?: number } | null)?.starDepth;
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
  if (mode === "push") window.history.pushState({ starDepth: flowDepth() + 1 }, "", url);
  else
    window.history.replaceState(
      depth === undefined ? window.history.state : { starDepth: depth },
      "",
      url,
    );
}





export function StarFlow({
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
  // 대화 줄은 한국어 표라 별명도 한국어 화면에서만 부른다.
  const nickname = useChemiNickname();
  const koNickname = locale === "ko" ? nickname : null;
  const [step, setStep] = useState<StarStep>("enter");
  const [picked, setPicked] = useState<"why" | "pair" | null>(null);
  const [character, setCharacter] = useState<StarCharacterId>("changha");
  const [reading, setReading] = useState<StarReading>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<Failure>("network");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [needBirth, setNeedBirth] = useState(false);
  const [birthBusy, setBirthBusy] = useState(false);
  const [birthError, setBirthError] = useState<string | null>(null);
  const [under14, setUnder14] = useState(false);
  const [restoring, setRestoring] = useState(restoringFromUrl);
  /** 저장된 결과를 불러오다 일시적으로 막힌 주소. 주소는 그대로 두고 다시 시도하게 한다. */
  const [restoreFailure, setRestoreFailure] = useState<{
    readingId: string;
    character: StarCharacterId;
    step: StarStep;
  } | null>(null);
  const [participation, setParticipation] = useState<Participation>(null);
  const collapsing = useRef(false);
  const abort = useRef<AbortController | null>(null);
  /** 저장된 결과를 불러오는 요청. 다른 주소로 이동하거나 새 요청이 시작되면 끊어 늦은 응답이 화면·주소를 덮지 못하게 한다. */
  const restore = useRef<AbortController | null>(null);

  const index = starCharacters.findIndex((c) => c.id === character);
  const name = creatorName(character, locale);

  /**
   * 주소의 결과 id로 저장된 오늘 결과를 불러온다. 결과가 없거나 오늘 것이 아니면(404·모양 불일치) 입장으로 돌리고,
   * 서버 장애·연결 끊김·로그인 갱신 같은 일시 실패는 주소를 그대로 두고 다시 시도를 보인다.
   */
  const loadSaved = useCallback(
    async (readingId: string, id: StarCharacterId, target: StarStep) => {
      restore.current?.abort();
      const controller = new AbortController();
      restore.current = controller;
      setRestoring(true);
      setRestoreFailure(null);
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/chemi/readings/${encodeURIComponent(readingId)}?c=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);
        if (restore.current !== controller) return;
        if (response.ok) {
          const data = parseTodayStar(body);
          if (!data) throw new ChemiRequestError("CHEMI_NOT_TODAY", response.status);
          setReading({ ...data, readingId, replayed: true });
          setStep(reachableStarStep(target, true));
          return;
        }
        throw new ChemiRequestError(body?.error?.code ?? null, response.status);
      } catch (error) {
        // 다른 주소로 떠났거나 새 불러오기가 이어받은 요청의 끝은 주소와 화면에 반영하지 않는다.
        if (restore.current !== controller) return;
        const gone =
          error instanceof ChemiRequestError &&
          (error.code === "CHEMI_NOT_TODAY" || error.status === 400 || error.status === 404);
        if (gone) {
          writeUrl({ step: null, r: null }, "replace");
          setReading(undefined);
          setStep("enter");
          showFanToast({ title: text("starMissing") });
        } else {
          setStep("enter");
          setRestoreFailure({ readingId, character: id, step: target });
        }
      } finally {
        if (restore.current === controller) {
          restore.current = null;
          setRestoring(false);
        }
      }
    },
    [getAccessToken],
  );

  useEffect(
    () => () => {
      abort.current?.abort();
      restore.current?.abort();
    },
    [],
  );

  const run = useCallback(
    async (id: StarCharacterId) => {
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
        const data = await requestStar(await getAccessToken(), id, controller.signal);
        const wait = Math.max(0, 1200 - (Date.now() - started));
        await new Promise((resolve) => setTimeout(resolve, wait));
        if (abort.current !== controller) return;
        if (controller.signal.aborted) throw Error();
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

  // 첫 진입: 주소의 단계·최애를 읽는다. 로그인 상태가 정해진 뒤 한 번만 처리한다.
  const entered = useRef(false);
  useEffect(() => {
    if (!ready || entered.current) return;
    entered.current = true;
    const url = readUrl();
    setCharacter(url.character);
    if (url.step !== "enter") {
      if (!authenticated) {
        writeUrl({ step: null, r: null }, "replace");
        setRestoring(false);
      } else if (url.readingId) void loadSaved(url.readingId, url.character, url.step);
      else if (url.step === "calc") {
        // 계산 중에 연 주소: 같은 날 같은 최애는 저장된 결과를 돌려주므로 요청을 이어 간다.
        setStep("calc");
        void run(url.character);
      } else {
        writeUrl({ step: null, r: null }, "replace");
        setRestoring(false);
      }
    }
    const controller = new AbortController();
    void loadParticipation(controller.signal)
      .then(setParticipation)
      .catch(() => {});
    return () => controller.abort();
    // run·loadSaved 는 getAccessToken 에만 기대므로 로그인 상태가 정해질 때 한 번이면 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  // 브라우저 뒤로·앞으로 이동. 기억하고 있는 결과가 주소의 결과 id와 같을 때만 쓴다.
  useEffect(() => {
    function onPop() {
      if (collapsing.current) return;
      // 계산 중에 떠나면 요청을 끊어, 늦게 온 응답이 화면을 끌고 가지 못하게 한다.
      abort.current?.abort();
      abort.current = null;
      restore.current?.abort();
      restore.current = null;
      setRestoring(false);
      const url = readUrl();
      setCharacter(url.character);
      setPhase("idle");
      setRestoreFailure(null);
      if (url.step === "calc") {
        if (!authenticated) {
          writeUrl({ step: null }, "replace", 0);
          setStep("enter");
          return;
        }
        setStep("calc");
        void run(url.character);
        return;
      }
      // 주소의 결과 id가 기억하는 결과와 다르면(다른 기록으로 이동) 그 결과를 다시 불러온다.
      if (url.step !== "enter" && url.readingId && url.readingId !== reading?.readingId) {
        setStep("enter");
        void loadSaved(url.readingId, url.character, url.step);
        return;
      }
      const usable = Boolean(reading) && (url.step === "enter" || url.readingId === reading?.readingId);
      const next = reachableStarStep(url.step, usable);
      // 주소가 가리키는 단계와 보이는 단계가 다르면 주소를 보이는 단계에 맞춘다.
      if (next !== url.step || (next !== "enter" && !url.readingId))
        writeUrl(
          { step: next === "enter" ? null : next, r: next === "enter" ? null : (reading?.readingId ?? null) },
          "replace",
        );
      setStep(next);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [reading, authenticated, run, loadSaved]);

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
    const id = starCharacters[(next + starCharacters.length) % starCharacters.length].id;
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

  function openChart() {
    writeUrl({ step: "chart", r: reading?.readingId ?? null, c: character }, "push");
    setStep("chart");
  }

  function advance() {
    const talk = starTalkNumber(step);
    if (talk === 4) return openResult();
    const next = nextStarStep(step);
    writeUrl({ step: next }, "push");
    setStep(next);
  }

  /** 대화의 두 번째 선택지: 바로 다음 이야기를 건너뛰고 그다음 이야기를 먼저 듣는다(마지막 앞에서는 정리로 간다). */
  function skipAhead() {
    const talk = starTalkNumber(step);
    if (!talk || talk >= 3) return openResult();
    // 고른 이야기를 기억해, 최애가 그 선택을 받아 말한다.
    setPicked(talk === 1 ? "why" : "pair");
    const next = `talk-${talk + 2}` as StarStep;
    writeUrl({ step: next }, "push");
    setStep(next);
  }

  const result = reading?.result;
  const derived = useMemo(() => {
    if (!reading || !result) return null;
    const signOf = (target: string) =>
      result.natal.find((planet) => planet.body === target)?.sign ?? null;
    return {
      reasons: pickReasons(result.reasons).map((reason) => reasonView(reason, signOf, reading.kstDate)),
      sunName: signList(result.signs.sun, (sign) => signNames[sign].full),
      sunBare: signList(result.signs.sun, (sign) => signNames[sign].bare),
    };
  }, [reading, result]);

  if (under14) return <Under14 locale={locale} />;

  if (restoring)
    return <StarResultSkeleton locale={locale} character={character} />;
  if (restoreFailure)
    return (
      <StarResultSkeleton
        locale={locale}
        character={restoreFailure.character}
        failed
        onRetry={() =>
          void loadSaved(restoreFailure.readingId, restoreFailure.character, restoreFailure.step)
        }
      />
    );
  if (step === "result" && reading && ask)
    return <AskScene locale={locale} content="star" character={character} readingId={reading.readingId} at={ask} />;
  if (step === "result" && reading)
    return (
      <StarResult
        locale={locale}
        reading={reading}
        character={character}
        backHref={`/chemi/star?c=${character}&locale=${locale}`}
        onChart={openChart}
        onAsk={() => askGo({ step: "result" })}
      />
    );
  if (step === "chart" && reading)
    return (
      <StarChart
        locale={locale}
        reading={reading}
        character={character}
        onBack={() => window.history.back()}
      />
    );

  const talk = starTalkNumber(step);
  const stars = result?.stars;
  const best = stars ? bestDomain(stars) : null;
  const worst = stars ? worstDomain(stars) : null;
  const entering = step === "enter" && !needBirth;
  const creator = starCharacters[index].sign;
  // 1은 첫 별점(놀람), 2는 좋은 분야와 낮은 분야·3은 행성 흐름(기본), 4는 둘 사이 궁합(웃음).
  const expression = !talk || !stars || phase !== "idle" ? null
    : talk === 1 ? expressionFor.firstReveal
    : talk === 4 ? expressionFor.bond
    : expressionFor.low;
  const line =
    step === "calc"
      ? starCalcLine(character)
      : talk === 1 && stars && derived
        ? starSignLine(character, derived.sunName, overallHeadline[stars.overall - 1]!)
        : talk === 2 && best && worst
          ? starBestLine(character, domainLabels[best], domainLabels[worst])
          : talk === 3
            ? starWhyLine(character, picked === "why")
            : talk === 4 && derived
              ? starPairLine(
                  character,
                  derived.sunBare,
                  creator ? signNames[creator].bare : null,
                  picked === "pair",
                  stars?.overall,
                )
              : needBirth
                ? starEnterLine(character, "birth", koNickname)
                : koNickname
                  ? starEnterLine(character, "enter", koNickname)
                  : text(`starEnter_${character}`);

  const primaryLabel = entering ? text("readHoroscope") : talk ? text(talkChoice[talk - 1]) : null;



  return (
    <div className={styles.page} data-star-flow={step}>
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
              {starCharacters.map((c) => (
                <FanAction
                  key={c.id}
                  variant="text"
                  className={styles.pickItem}
                  aria-pressed={c.id === character}
                  onClick={() => choose(starCharacters.indexOf(c))}
                >
                  <img src={`${art}/avatar-${c.id}-v1.jpg`} alt="" />
                  <FanText role={c.id === character ? "label" : "meta"}>{creatorName(c.id, locale)}</FanText>
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
              <FanAction variant="text" className={styles.skip} onClick={openResult}>
                <ReadingText id="skip" />
              </FanAction>
            )}
          </>
        )}
      </div>
      <div className={styles.stage}>
        <div className={styles.art}>
          <picture>
            <source media="(min-width: 48rem)" srcSet={`${art}/hero-${character}-l-v1.webp`} />
            <img src={`${art}/hero-${character}-p-v1.webp`} alt={text("nightArt", { name })} />
          </picture>
          <SceneExpression scene="star" character={character} portrait={`${art}/hero-${character}-p-v1.webp`} expression={expression} />
        </div>
        {phase === "error" ? (
          <div className={styles.controls}>
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
          </div>
        ) : (
          <div className={styles.controls}>
            {entering && (
              <div className={styles.title}>
                <FanHeading as="h1"><ReadingTitle id="zodiac" /></FanHeading>
                {participation && (
                  <FanText role="meta">{text(`${participation.period}Views`, { count: participation.count.toLocaleString(locale) })}</FanText>
                )}
              </div>
            )}
            {talk === 1 && stars && derived && reading && (
              <div className={styles.signCard}>
                <FanText role="meta">{new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }).format(new Date(reading.kstDate))} · {text("skyToday")}</FanText>
                <div className={styles.signLine}>
                  <FanHeading as="h2">{derived.sunName}</FanHeading>
                  <StarRating
                    value={stars.overall}
                    label={text("overallStars", { count: stars.overall })}
                    tone="accent"
                  />
                  <FanText role="meta" className={styles.signTail}>
                    <ReadingText id="overall" />
                  </FanText>
                </div>
              </div>
            )}
            {talk === 2 && stars && (
              <ul className={styles.sceneRows}>
                {domains.map((key) => (
                  <li data-row="star" className={styles.sceneRow} key={key}>
                    <div className={styles.sceneHead}>
                      <FanText role="label">{text(`star_${key}`)}</FanText>
                      <StarRating
                        value={stars[key]}
                        label={text("ratedStars", { domain: text(`star_${key}`), count: stars[key] })}
                      />
                    </div>
                    <FanText as="p" role="body">
                      {domainLine[key][stars[key] - 1]}
                    </FanText>
                  </li>
                ))}
              </ul>
            )}
            {talk === 3 && derived && (
              <ul className={styles.reasonList}>
                {derived.reasons.map((reason) => (
                  <li data-row="star" key={reason.title + reason.aspect}>
                    <div className={styles.reasonHead}>
                      <FanText as="strong" role="item">
                        {reason.title}
                      </FanText>
                      <FanText role="meta">{reason.when}</FanText>
                    </div>
                    <FanText as="p" role="meta">
                      {reason.tone}
                    </FanText>
                  </li>
                ))}
              </ul>
            )}
            {talk === 4 && derived && (
              <div className={styles.pair}>
                {creator && (
                  <div className={styles.pairSide}>
                    <img className={styles.pairFace} src={`${art}/face-${character}-v1.webp`} alt="" />
                    <span>
                      <FanText as="strong" role="item">
                        {name}
                      </FanText>
                      <FanText as="span" role="meta">
                        {signNames[creator].bare}
                      </FanText>
                    </span>
                  </div>
                )}
                {creator && <span className={styles.pairLine} aria-hidden="true" />}
                <div className={styles.pairSide}>
                  <FanText as="span" role="label" className={styles.pairMe} aria-hidden="true">
                    {result?.signs.sun[0] ? signGlyphs[result.signs.sun[0]] : <ReadingText id="me" />}
                  </FanText>
                  <span>
                    <FanText as="strong" role="item">
                      <ReadingText id="me" />
                    </FanText>
                    <FanText as="span" role="meta">
                      {derived.sunBare}
                    </FanText>
                  </span>
                </div>
              </div>
            )}
            <section className={styles.dialog} aria-live="polite">
              <p className={styles.who} data-face={talk ? "" : undefined}>
                {talk && (
                  <img className={styles.face} src={`${art}/face-${character}-v1.webp`} alt="" />
                )}
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
                  variant={entering || talk === 4 ? "primary" : "neutral"}
                  disabled={entering && !ready}
                  onClick={() => (entering ? start() : advance())}
                >
                  {primaryLabel}
                </FanAction>
                {talk && talk < 4 && (
                  <FanAction variant="neutral" onClick={skipAhead}>
                    {text(talkChoice[talk as 1 | 2 | 3])}
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
          <ReadingText id="starLogin" />
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
