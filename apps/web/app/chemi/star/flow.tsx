"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "@/components/fan-ui/fan-icons";
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
  reasonView,
  signNames,
  starBestLine,
  starCalcLine,
  starCharacters,
  starEnterLine,
  starPairLine,
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
import { StarResult, StarResultSkeleton } from "./result";
import { StarRating } from "./stars";
import { Under14 } from "./under-14";
import styles from "./scene.module.css";

const talkChoice = ["영역별로도 알려 줘", "왜 그런 거야?", "우리 둘은?", "오늘 정리 보기"] as const;

type Phase = "idle" | "calc" | "error";
/** 오류 안내를 가른다: 로그인 만료, 서비스 거절, 연결 끊김. */
type Failure = "auth" | "service" | "network";
const failureTitle: Record<Failure, string> = {
  auth: "로그인이 만료되었습니다.",
  service: "별자리 운세를 불러오지 못했습니다.",
  network: "연결이 끊겼습니다.",
};
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

function participationText(participation: Participation) {
  if (!participation) return null;
  const prefix = { today: "오늘", week: "이번 주", all: "지금까지" }[participation.period];
  return `${prefix} ${participation.count.toLocaleString("ko-KR")}명이 봤어요`;
}

function dayLabel(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long", timeZone: "UTC" }).format(day);
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${weekday}`;
}

export function StarFlow({
  locale,
  restoring: restoringFromUrl = false,
}: {
  locale: AppLocale;
  /** 주소에 단계와 결과가 있어 저장된 결과를 불러오는 중이면 입장 화면 대신 불러오는 모양을 그린다. */
  restoring?: boolean;
}) {
  const { ready, authenticated, getAccessToken, login } = useByUsAuth();
  const [step, setStep] = useState<StarStep>("enter");
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
  const [participation, setParticipation] = useState<Participation>(null);
  const collapsing = useRef(false);
  const abort = useRef<AbortController | null>(null);

  const index = starCharacters.findIndex((c) => c.id === character);
  const name = starCharacters[index].name;

  // 첫 진입: 주소의 단계·최애를 읽는다. 결과가 없으면 입장으로 돌린다.
  useEffect(() => {
    async function restore(readingId: string, id: StarCharacterId, target: StarStep) {
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
        const data = parseTodayStar(await response.json().catch(() => null));
        if (!response.ok || !data) throw Error();
        setReading({ ...data, readingId, replayed: true });
        setStep(reachableStarStep(target, true));
      } catch {
        writeUrl({ step: null, r: null }, "replace");
        setStep("enter");
        showFanToast({ title: "오늘의 별자리 결과가 아니라 처음 화면으로 돌아왔어요." });
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
      if (url.step === "calc" && !reading) {
        if (!authenticated) {
          writeUrl({ step: null }, "replace", 0);
          setStep("enter");
          return;
        }
        setStep("calc");
        void run(url.character);
        return;
      }
      const next = reachableStarStep(url.step, Boolean(reading));
      // 주소가 가리키는 단계와 보이는 단계가 다르면 주소를 보이는 단계에 맞춘다.
      if (next !== url.step)
        writeUrl({ step: next === "enter" ? null : next, r: reading?.readingId ?? null }, "replace");
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
        setBirthError("저장하지 못했어요. 다시 시도해 주세요.");
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

  const result = reading?.result;
  const derived = useMemo(() => {
    if (!reading || !result) return null;
    const signOf = (target: string) =>
      result.natal.find((planet) => planet.body === target)?.sign ?? null;
    return {
      reasons: result.reasons.slice(0, 3).map((reason) => reasonView(reason, signOf, reading.kstDate)),
      sunName: signList(result.signs.sun, (sign) => signNames[sign].full),
      sunBare: signList(result.signs.sun, (sign) => signNames[sign].bare),
    };
  }, [reading, result]);

  if (under14) return <Under14 locale={locale} />;

  if (restoring)
    return <StarResultSkeleton locale={locale} character={character} />;
  if (step === "result" && reading)
    return (
      <StarResult
        locale={locale}
        reading={reading}
        character={character}
        backHref={`/chemi/star?c=${character}&locale=${locale}`}
        onChart={openChart}
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
  const line =
    step === "calc"
      ? starCalcLine(character)
      : talk === 1 && stars && derived
        ? starSignLine(character, derived.sunName, overallHeadline[stars.overall - 1]!)
        : talk === 2 && best && worst
          ? starBestLine(character, domainLabels[best], domainLabels[worst])
          : talk === 3
            ? starWhyLine(character)
            : talk === 4 && derived
              ? starPairLine(
                  character,
                  derived.sunBare,
                  creator ? signNames[creator].bare : null,
                )
              : starEnterLine(character, needBirth ? "birth" : "enter");

  const primaryLabel = entering ? "응, 봐 줘" : talk ? talkChoice[talk - 1] : null;

  const turns = (cls: string, side = false) => (
    <>
      <FanAction
        variant="neutral"
        className={side ? `${cls} ${styles.prev}` : cls}
        ariaLabel="이전 최애"
        leadingIcon={<FanIcon icon={ChevronLeft} />}
        onClick={() => choose(index - 1)}
      />
      <FanAction
        variant="neutral"
        className={side ? `${cls} ${styles.next}` : cls}
        ariaLabel="다음 최애"
        leadingIcon={<FanIcon icon={ChevronRight} />}
        onClick={() => choose(index + 1)}
      />
    </>
  );

  return (
    <div className={styles.page} data-star-flow={step}>
      <div className={styles.chips}>
        {step === "enter" ? (
          <FanAction
            variant="neutral"
            href={`/chemi?locale=${locale}`}
            ariaLabel="케미 탭으로 돌아가기"
            leadingIcon={<FanIcon icon={ChevronLeft} />}
            className={styles.round}
          />
        ) : (
          <FanAction
            variant="neutral"
            ariaLabel="뒤로 가기"
            leadingIcon={<FanIcon icon={ChevronLeft} />}
            className={styles.round}
            onClick={() => window.history.back()}
          />
        )}
        {step === "enter" ? (
          <>
            <div className={styles.pick} role="group" aria-label="최애">
              {starCharacters.map((c) => (
                <FanAction
                  key={c.id}
                  variant="text"
                  className={styles.pickItem}
                  aria-pressed={c.id === character}
                  onClick={() => choose(starCharacters.indexOf(c))}
                >
                  <img src={`${art}/avatar-${c.id}-v1.jpg`} alt="" />
                  <FanText role={c.id === character ? "label" : "meta"}>{c.name}</FanText>
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
              <FanAction variant="text" className={styles.skip} onClick={openResult}>
                건너뛰기
              </FanAction>
            )}
          </>
        )}
      </div>
      <div className={styles.stage}>
        <picture className={styles.art}>
          <source media="(min-width: 48rem)" srcSet={`${art}/hero-${character}-l-v1.webp`} />
          <img src={`${art}/hero-${character}-p-v1.webp`} alt={`${name}와 밤하늘 별자리`} />
        </picture>
        {step === "enter" && <span className={styles.turnStage}>{turns(styles.turn, true)}</span>}
        {phase === "error" ? (
          <div className={styles.controls}>
            <FanState
            inline
            kind={failure === "auth" ? "auth" : "error"}
            title={failureTitle[failure]}
            actions={
              failure === "auth" ? (
                <FanAction size="sm" onClick={login}>
                  로그인
                </FanAction>
              ) : (
                <FanAction size="sm" onClick={() => void run(character)}>
                  다시 시도
                </FanAction>
              )
            }
          />
          </div>
        ) : (
          <div className={styles.controls}>
            {entering && (
              <div className={styles.title}>
                <FanHeading as="h1">별자리 운세</FanHeading>
                {participationText(participation) && (
                  <FanText role="meta">{participationText(participation)}</FanText>
                )}
              </div>
            )}
            {talk === 1 && stars && derived && reading && (
              <div className={styles.signCard}>
                <FanText role="meta">{dayLabel(reading.kstDate)} · 오늘 하늘</FanText>
                <FanHeading as="h2">{derived.sunName}</FanHeading>
                <div className={styles.starsLine}>
                  <FanText role="meta">총운</FanText>
                  <StarRating
                    value={stars.overall}
                    label={`총운 별점 5개 중 ${stars.overall}개`}
                    size={20}
                    tone="accent"
                  />
                </div>
              </div>
            )}
            {talk === 2 && stars && (
              <ul className={styles.sceneRows}>
                {domains.map((key) => (
                  <li data-row="star" className={styles.sceneRow} key={key}>
                    <div>
                      <FanText role="label">{domainLabels[key]}</FanText>
                      <StarRating
                        value={stars[key]}
                        label={`${domainLabels[key]} 별점 5개 중 ${stars[key]}개`}
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
                    <FanText as="strong" role="item">
                      {reason.title}
                    </FanText>
                    <FanText role="meta">{reason.when}</FanText>
                  </li>
                ))}
              </ul>
            )}
            {talk === 4 && derived && (
              <div className={styles.pair}>
                {creator && (
                  <div>
                    <FanText role="meta">{name}</FanText>
                    <FanText as="strong" role="item">
                      {signNames[creator].bare}
                    </FanText>
                  </div>
                )}
                <div>
                  <FanText role="meta">나</FanText>
                  <FanText as="strong" role="item">
                    {derived.sunBare}
                  </FanText>
                </div>
              </div>
            )}
            {primaryLabel && (
              <div className={styles.choices}>
                {entering && (
                  <FanAction variant="neutral" href={`/chemi?locale=${locale}`}>
                    다음에
                  </FanAction>
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
          </div>
        )}
      </div>
      <FanDialog
        open={sheet === "login"}
        onOpenChange={(open) => !open && setSheet(null)}
        title="로그인"
        size="sm"
        closeLabel="닫기"
        primary={{ label: "로그인 후 계속", onClick: login }}
      >
        <FanText as="p" role="body">
          별자리 운세를 보려면 로그인해 주세요.
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
