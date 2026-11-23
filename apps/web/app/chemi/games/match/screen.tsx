"use client";

import { ExtraPlayDialog } from "@/features/chemi/ui/extra-play-dialog";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { FanNumUnit } from "@/components/fan-ui/fan-num-unit";
import numberStyles from "@/components/fan-ui/fan-number.module.css";
import type { CSSProperties, ReactNode } from "react";
import { RollingNumber } from "@/components/fan-ui/rolling-number";
import { celebrateSpend } from "@/components/fan-ui/reward-celebration";
import { parseAppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import {
  Check,
  ChevronLeft,
  Music2,
  Pause,
  Volume2,
  VolumeX,
} from "@/components/fan-ui/fan-icons";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useChemiFeatures } from "@/features/chemi/domain/features";
import { FPS, LEVELS } from "@/features/chemi/games/engine";
import { rankName } from "@/features/chemi/games/rank-name";
import { RankInitial } from "@/features/chemi/games/rank-initial";
import { fillCount, getExtraPlayCopy } from "@/features/chemi/ui/extra-play-copy";
import type { MatchCopy } from "./copy";
import { useMatchRound, type Submission, type Ticket } from "./use-match-round";
import { EmptyRankingRow } from "../../game-rankings";
import styles from "./match.module.css";

const characters = ["changha", "elina", "yuna"] as const;
type Character = (typeof characters)[number];
type Photos = Record<
  Character,
  {
    portrait: string;
    scene: string;
    lobby?: string;
    cards: readonly string[];
  }
>;
type Stage = "start" | "guide" | "play" | "pause" | "result" | "empty" | "reminder";
const GUIDE_KEY = "chemi.match.guide";
/** 처음 한 번만 방법 안내를 띄운다. 저장소를 못 쓰면 매번 띄운다. */
function guideSeen() {
  try { return localStorage.getItem(GUIDE_KEY) === "1"; } catch { return false; }
}
function markGuideSeen() {
  try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* 다음에 다시 보여 준다 */ }
}
/**
 * 시작을 누른 뒤 판을 받기 전(key) 또는 판 도중(playId)에 페이지가 바뀌었는지 같은 탭 안에서만 기억한다.
 * 다시 들어오면 받기 전이면 그 판을 돌려받고(무료 판 그대로), 판 도중이면 그 판을 끝내고 알린다.
 */
const PENDING_KEY = "chemi.match.pending";
type Pending = { key: string } | { playId: string };
function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}
function writePending(value: Pending | null) {
  try {
    if (value) sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch { /* 저장소를 못 쓰면 떠날 때 보내는 요청만 남는다 */ }
}
/** 페이지가 닫히는 중에도 끝까지 가는 요청(시작 취소·판 끝내기). */
function sendOnExit(token: string | null, body: object) {
  if (!token) return;
  void fetch("/api/chemi/games", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify(body),
  }).catch(() => {});
}
/** 무료 판은 한국 자정에 다시 채워진다. */
function untilKstMidnight(now: number) {
  const day = 86_400_000, offset = 9 * 3_600_000;
  return (Math.floor((now + offset) / day) + 1) * day - offset - now;
}
function hms(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(n => String(n).padStart(2, "0")).join(":");
}
type Row = {
  nickname: string;
  character: Character;
  place: number;
  score?: number;
  ticks: number;
  misses: number;
  isMe: boolean;
  isFriend?: boolean;
};
type Lobby = {
  extraCost: number;
  points: number;
  ranking: Row[];
  freeRemaining: number;
  extraRemaining: number;
  sound: boolean;
  previous?: { place: number; score: number } | null;
};
type Challenge = {
  nickname: string;
  character: Character;
  ticks: number;
  misses: number;
  ranking: Row[];
  available: boolean;
};
/** 화면에 보이는 오류 한 가지. 문구는 copy 의 같은 이름 키. */
type ErrorKind = "error" | "insufficient" | "authExpired" | "saveFailed";
function errorKind(e: unknown, fallback: ErrorKind = "error"): ErrorKind {
  const code = String(e);
  if (code.includes("INSUFFICIENT")) return "insufficient";
  if (code.includes("AUTH_EXPIRED")) return "authExpired";
  return fallback;
}
/** 응답이 20초 안에 오지 않으면 실패로 보고 다시 시도를 보인다(운세 흐름의 제한과 같은 결). */
const REQUEST_TIMEOUT = 20_000;
/** 라운드마다 미리 보기 전에 판 사진을 기다리는 최대 시간. 넘으면 받은 만큼으로 센다. */
const PRELOAD_LIMIT = 8_000;
function fill(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
type Finish = { excitement?: number; titleStage?: number; score: number; exp: number; shareId?: string };
type Props = {
  copy: MatchCopy;
  locale: string;
  share: string | null;
  photos: Photos;
};

function StageAction({
  children,
  disabled,
  loading,
  helperText,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  helperText?: string;
  onClick: () => void;
}) {
  return (
    <FanAction
      variant="primary"
      disabled={disabled}
      loading={loading}
      onClick={onClick}
      helperText={helperText}
    >
      {children}
    </FanAction>
  );
}

/** 라운드 완료: 공통 모달 면(fan-dialog) 위에 최애 장면 그림, 항목별 점수가 차례로 들어오고 기록이 그만큼 굴러 올라간다. 닫기 없이 두 버튼으로만 나간다. */
function ClearDialog({ label, recordLabel, art, portrait, name, round, rounds, lines, score, locale, children }: {
  label: string; recordLabel: string; art: string; portrait: string; name: string; round: number; rounds: number;
  lines: readonly (readonly [string, number])[]; score: number; locale: string; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const gained = lines.reduce((sum, [, points]) => sum + points, 0);
  const [shown, setShown] = useState(score - gained);
  useEffect(() => {
    dialog.current?.showModal?.();
    const timer = window.setTimeout(() => setShown(score), 90 * lines.length + 200);
    return () => window.clearTimeout(timer);
  }, [score, lines.length]);
  const format = (n: number) => n.toLocaleString(locale);
  return <dialog ref={dialog} className={styles.clearPanel} aria-label={label}
    onCancel={event => event.preventDefault()}>
    <div className={styles.clearArt}>
      <Image width={1440} height={550} sizes="(min-width: 768px) 480px, 100vw" alt="" src={art} />
      <Image className={styles.clearFace} width={112} height={112} alt={name} src={portrait} />
    </div>
    <div className={styles.clearHead}>
      <FanHeading>{label}</FanHeading>
      <FanText role="label" className={styles.clearRound}>{round} / {rounds}</FanText>
    </div>
    <ScoreLines lines={lines} locale={locale} />
    <div className={styles.clearTotal}>
      <FanText role="label">{recordLabel}</FanText>
      <strong className={numberStyles.xl}><RollingNumber value={shown} format={format} /></strong>
    </div>
    {children}
  </dialog>;
}

/** 점수 항목(찾은 짝·CLEAR·시간·정확도)을 한 줄씩: 이름 왼쪽, +점수 오른쪽. 줄은 90ms 시차로 들어온다. */
function ScoreLines({ lines, locale }: { lines: readonly (readonly [string, number])[]; locale: string }) {
  return <dl className={styles.clearLines}>
    {lines.map(([title, points]) => <div key={title}>
      <FanText as="dt" role="meta">{title}</FanText>
      <dd className={numberStyles.md}>+{points.toLocaleString(locale)}</dd>
    </div>)}
  </dl>;
}

/** 카드 한 장: 뒷면 무늬·앞면 사진·맞춤 표시·틀림 표시(빨간 테두리 + '틀림' 글자 + 짧은 흔들림). */
function MatchCard({ open, matched, wrong, src, label, number, faceNumber, disabled, wrongLabel, onClick, onReady }: {
  open: boolean; matched: boolean; wrong: boolean; src: string; label: string; number: number; faceNumber?: number;
  disabled: boolean; wrongLabel: string; onClick: () => void; onReady?: (src: string) => void;
}) {
  // 뒤집힌 카드도 사진을 미리 받아 둔다(보이지 않게). 미리 보기가 시작될 때 이미 떠 있어야 한다(DF-GAME-002).
  return (
    <div className={styles.card} data-open={open} data-matched={matched} data-wrong={wrong || undefined}>
      <FanAction variant="text" disabled={disabled} ariaLabel={label} onClick={onClick}>
        <Image width={640} height={800} sizes="(min-width: 768px) 210px, 33vw" loading="eager"
          unoptimized={src.startsWith("/chemi/match/") || src.startsWith("/api/")} src={src} alt=""
          onLoad={() => onReady?.(src)} onError={() => onReady?.(src)} />
        {open && faceNumber && <small className={styles.cardNumber}>{faceNumber}</small>}
        {!open && <small className={styles.cardNumber}>{String(number).padStart(2, "0")}</small>}
        {matched && (
          <i>
            <FanIcon icon={Check} size={16} />
          </i>
        )}
        {wrong && <FanText role="label" className={styles.wrongMark}>{wrongLabel}</FanText>}
      </FanAction>
    </div>
  );
}

const PRACTICE = [0, 1, 1, 0] as const;

/** 방법 안내의 2×2 연습 판: 판을 쓰지 않고 기록도 남지 않는다. */
function Practice({ faces, copy, onDone }: { faces: readonly string[]; copy: MatchCopy; onDone: () => void }) {
  // 실제 판처럼 처음에 앞면을 잠깐 보여 준다(안내 1번과 같게).
  const [peek, setPeek] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setPeek(false), 2000);
    return () => window.clearTimeout(timer);
  }, []);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState(0);
  const [wrong, setWrong] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!wrong) return;
    const timer = window.setTimeout(() => { setOpen([]); setWrong(false); }, 800);
    return () => window.clearTimeout(timer);
  }, [wrong]);
  function flip(index: number) {
    if (open.length === 2 || open.includes(index) || matched & (1 << index)) return;
    const next = [...open, index];
    if (next.length < 2) return setOpen(next);
    if (PRACTICE[next[0]] === PRACTICE[next[1]]) {
      const all = matched | (1 << next[0]) | (1 << next[1]);
      setMatched(all);
      setOpen([]);
      if (all === 0b1111) done.current();
    } else {
      setOpen(next);
      setWrong(true);
    }
  }
  return (
    <div className={styles.practice} data-columns="2">
      {PRACTICE.map((face, index) => {
        const isMatched = Boolean(matched & (1 << index));
        const isOpen = peek || isMatched || open.includes(index);
        return <MatchCard key={index} open={isOpen} matched={isMatched} wrong={wrong && open.includes(index)}
          src={faces[face]} number={index + 1} wrongLabel={copy.wrong}
          label={[copy.card, index + 1, isMatched ? copy.matched : isOpen ? copy.openCard : copy.closedCard].join(" ")}
          disabled={peek || isMatched || open.includes(index) || open.length === 2} onClick={() => flip(index)} />;
      })}
    </div>
  );
}

function clock(ticks: number) {
  const seconds = Math.floor(ticks / FPS);
  return [Math.floor(seconds / 60), seconds % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function Rankings({
  rows,
  copy,
  full,
  locale,
}: {
  rows: Row[];
  copy: MatchCopy;
  full: boolean;
  locale: string;
}) {
  const me = rows.find((row) => row.isFriend) ?? rows.find((row) => row.isMe);
  const displayed = full ? rows : rows.slice(0, 3);
  const mineOutside = me && !displayed.includes(me);
  return (
    <section className={styles.ranking} aria-label={copy.ranking}>
      <FanHeading as="h2">{copy.ranking}</FanHeading>
      {full && !rows.length && <p>{copy.emptyRanking}</p>}
      <ol data-lobby={full ? undefined : ""}>
        {[...displayed, ...(mineOutside ? [me] : [])].map((row, i) => (
          <li
            data-row=""
            key={i}
            className={[
              row.isMe || row.isFriend ? styles.mine : "",
              full && i >= 3 && !(row.isMe || row.isFriend)
                ? styles.wideOnly
                : "",
              i >= 3 && (row.isMe || row.isFriend) ? styles.mineGap : "",
            ].join(" ")}
          >
            <b>{row.place}</b>
            <span className={styles.avatar} aria-hidden="true">
              <RankInitial nickname={row.nickname} />
            </span>
            <span>
              {rankName(row.nickname, locale)}
              {(row.isMe || row.isFriend) && (
                <small> · {row.isFriend ? copy.friend : copy.me}</small>
              )}
            </span>
            <FanText role="meta">{copy[row.character]}</FanText>
            <b>{row.score?.toLocaleString() ?? clock(row.ticks)}</b>
          </li>
        ))}
        {!full && Array.from({ length: Math.max(0, 3 - displayed.length) }, (_, index) => (
          <li data-row="" key={`vacant-${index}`}>
            <EmptyRankingRow place={displayed.length + index + 1} />
          </li>
        ))}
      </ol>
    </section>
  );
}

const DONE_LINE = { changha: "doneChangha", elina: "doneElina", yuna: "doneYuna" } as const;

export function MatchScreen(props: Props) {
  const auth = useByUsAuth();
  return <Session key={auth.user?.id ?? "guest"} {...props} auth={auth} />;
}

function Session({
  copy,
  locale,
  photos,
  share,
  auth,
}: Props & { auth: ReturnType<typeof useByUsAuth> }) {
  const [stage, setStage] = useState<Stage>("start");
  const [character, setCharacter] = useState<Character>("changha");
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [publicRows, setPublicRows] = useState<Row[] | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [equipped, setEquipped] = useState(false);
  const [priorRank, setPriorRank] = useState<number | null>(null);
  const [result, setResult] = useState<Finish | null>(null);
  const [pendingFinish, setPendingFinish] = useState<Submission | null>(null);
  const [error, setError] = useState<ErrorKind | "">("");
  /** 판 사진 중 받은 것. 라운드의 사진이 다 오거나 제한 시간이 지나면 그 라운드의 미리 보기를 센다. */
  const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set());
  const [forced, setForced] = useState(0);
  const [paying, setPaying] = useState(false);
  const [working, setWorking] = useState(false);
  const [sound, setSound] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const { reminders } = useChemiFeatures();
  const [copied, setCopied] = useState(false);
  const [load, setLoad] = useState(0);
  const [practiced, setPracticed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const audio = useRef<AudioContext | null>(null);
  const inFlight = useRef(false);
  /** 판을 받았지만 첫 라운드 사진을 아직 기다리는 동안의 시작 키. 이때 떠나면 판을 돌려받는다. */
  const pendingKey = useRef<string | null>(null);
  const accessToken = useRef<string | null>(null);
  const startKey = useRef({ choice: "", key: "" });
  const tokenGetter = useRef(auth.getAccessToken);
  tokenGetter.current = auth.getAccessToken;
  const call = useCallback(
    async <T,>(
      body: object,
      path = "/api/chemi/games",
      anonymous = false,
    ): Promise<T> => {
      const token = anonymous ? null : await tokenGetter.current();
      if (!anonymous) accessToken.current = token;
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: "Bearer " + token } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        const code = String(data.error ?? response.status);
        // 로그인이 풀리면 다시 시도로는 풀리지 않는다. 케미가 직접 거절한 403(CHEMI_*)은 로그인 문제가 아니다.
        if (response.status === 401 || (response.status === 403 && !code.startsWith("CHEMI_")))
          throw new Error("AUTH_EXPIRED");
        if (!response.ok) throw new Error(code);
        return data;
      } finally {
        window.clearTimeout(timer);
      }
    },
    [],
  );
  useEffect(() => {
    if (!auth.ready) return;
    let active = true;
    setError("");
    if (share)
      void call<Challenge>(
        { action: "challenge", shareId: share },
        undefined,
        true,
      )
        .then((data) => {
          if (active) {
            setChallenge(data);
            setCharacter(data.character);
          }
        })
        .catch((e) => {
          if (active) setError(errorKind(e));
        });
    if (!auth.authenticated && !share) {
      void call<{ ranking: Row[] }>({ action: "ranking" }, undefined, true)
        .then((data) => {
          if (active) setPublicRows(data.ranking);
        })
        .catch((e) => {
          if (active) setError(errorKind(e));
        });
    }
    if (auth.authenticated) {
      const pending = readPending();
      if (pending && "playId" in pending) setEnded(true);
      const settled = pending
        ? call("key" in pending ? { action: "cancel", key: pending.key } : { action: "leave", playId: pending.playId })
            .then(() => writePending(null), () => {})
        : Promise.resolve();
      void settled
        .then(() => call<Lobby>({ action: "lobby" }))
        .then((data) => {
          if (active) {
            setLobby(data);
            setSound(data.sound);
          }
        })
        .catch((e) => {
          if (active) setError(errorKind(e));
        });
    }
    return () => {
      active = false;
    };
  }, [auth.ready, auth.authenticated, call, share, load]);
  useEffect(
    () => () => {
      void audio.current?.close().catch(() => {});
    },
    [],
  );

  async function action(work: () => Promise<void>, fallback: ErrorKind = "error") {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errorKind(e, fallback));
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }
  function facesFor(who: Character) {
    const cards = photos[who].cards;
    return Array.from({ length: LEVELS[LEVELS.length - 1].pairs }, (_, i) => cards[i % cards.length]);
  }
  const cardReady = useCallback((src: string) => {
    setReady((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  }, []);
  async function start(who: Character, extra = false, fromGuide = false) {
    if (!auth.authenticated && !share) {
      auth.login();
      return;
    }
    setCharacter(who);
    if (fromGuide) markGuideSeen();
    else if (!extra && !guideSeen()) {
      setPracticed(false);
      setStage("guide");
      return;
    }
    if (!share && !extra && lobby?.freeRemaining === 0) {
      setStage("empty");
      return;
    }
    setEnded(false);
    await action(async () => {
      const choice = who + ":" + extra;
      if (startKey.current.choice !== choice)
        startKey.current = { choice, key: crypto.randomUUID() };
      const trial = Boolean(share && !auth.authenticated);
      const key = startKey.current.key;
      // 판을 받기 전에 페이지가 닫히면 그 판은 쓰지 않은 것으로 돌린다(K-7578e3 중복 차감 없음).
      const cancelOnExit = (event: PageTransitionEvent) => {
        if (!event.persisted) sendOnExit(accessToken.current, { action: "cancel", key });
      };
      if (!trial) {
        writePending({ key });
        window.addEventListener("pagehide", cancelOnExit);
      }
      let next: Ticket;
      try {
        next = await call<Ticket>(
          trial
            ? { action: "trial", shareId: share, key: startKey.current.key }
            : {
                action: "start",
                game: "match",
                character: who,
                key: startKey.current.key,
                extra,
              },
          undefined,
          trial,
        );
      } catch (e) {
        if (String(e).includes("CHEMI_LIMIT")) {
          startKey.current.choice = "";
          writePending(null);
          if (trial) {
            setChallenge((prev) => prev && { ...prev, available: false });
            return;
          }
          window.removeEventListener("pagehide", cancelOnExit);
          setStage("empty");
          if (auth.authenticated)
            setLobby(await call<Lobby>({ action: "lobby" }));
          return;
        }
        window.removeEventListener("pagehide", cancelOnExit);
        throw e;
      }
      window.removeEventListener("pagehide", cancelOnExit);
      // 사진을 받는 동안(미리 보기 전)에는 시작 키를 그대로 둔다: 이때 떠나면 판을 돌려받는다.
      if (!trial) pendingKey.current = key;
      setForced(0);
      setReady(new Set());
      startKey.current.choice = "";
      setEquipped(false);
      setPriorRank(lobby?.ranking.find(row => row.isMe)?.place ?? null);
      setTicket(next);
      setResult(null);
      setPendingFinish(null);
      setCopied(false);
      setStage("play");
      if (extra && !trial && lobby) {
        setPaying(false);
        celebrateSpend({ locale: parseAppLocale(locale), points: lobby.extraCost, label: copy.extraPlay });
      }
      if (trial && challenge) setChallenge({ ...challenge, available: false });
      if (!trial)
        setLobby(
          (prev) =>
            prev && {
              ...prev,
              points: prev.points - (extra ? prev.extraCost : 0),
              [extra ? "extraRemaining" : "freeRemaining"]: Math.max(
                0,
                prev[extra ? "extraRemaining" : "freeRemaining"] - 1,
              ),
            },
        );
    });
  }
  async function submit(body: Submission) {
    writePending(null);
    setPendingFinish(body);
    setStage("result");
    if (!auth.authenticated) {
      setResult({ score: body.score, exp: 0 });
      setPendingFinish(null);
      return;
    }
    await action(async () => {
      const data = await call<Finish>(body);
      setResult(data);
      setPendingFinish(null);
      setLobby(await call<Lobby>({ action: "lobby" }));
    }, "saveFailed");
  }
  useEffect(() => {
    if (stage !== "empty") return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);
  // 이번 라운드 사진이 다 올 때까지(최대 8초) 시계와 미리 보기를 세지 않는다.
  const [roundStage, setRoundStage] = useState(1);
  const roundPhotos = facesFor(character).slice(0, LEVELS[roundStage - 1].pairs);
  const photosReady = forced >= roundStage || roundPhotos.every((src) => ready.has(src));
  const { view, tap, nextLevel, finishLevel } = useMatchRound(ticket, stage !== "play" || !photosReady, submit);
  const viewStage = view?.stage ?? 1;
  useEffect(() => setRoundStage(viewStage), [viewStage]);
  useEffect(() => {
    if (!ticket || photosReady) return;
    const timer = window.setTimeout(() => setForced(roundStage), PRELOAD_LIMIT);
    return () => window.clearTimeout(timer);
  }, [ticket, roundStage, photosReady]);
  // 첫 라운드 사진이 다 오면 그때부터 판이 시작된 것으로 본다(이전에 떠나면 판을 돌려받음).
  useEffect(() => {
    if (!ticket || !photosReady || !pendingKey.current) return;
    pendingKey.current = null;
    writePending({ playId: ticket.playId });
  }, [ticket, photosReady]);
  useEffect(() => {
    if (!ticket || !["play", "pause"].includes(stage)) return;
    const visibility = () => {
      if (document.hidden) setStage("pause");
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [ticket, stage]);
  useEffect(() => {
    if (!ticket || (stage !== "play" && stage !== "pause")) return;
    if (!history.state?.matchGuard)
      history.pushState(
        { ...history.state, matchGuard: true },
        "",
        location.href,
      );
    const back = () => {
      history.pushState(
        { ...history.state, matchGuard: true },
        "",
        location.href,
      );
      setStage("pause");
    };
    const abandon = () => sendOnExit(accessToken.current, pendingKey.current
      ? { action: "cancel", key: pendingKey.current }
      : { action: "leave", playId: ticket.playId });
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setTicket(null);
        setStage("start");
        setLoad((v) => v + 1);
      }
    };
    window.addEventListener("popstate", back);
    window.addEventListener("pagehide", abandon);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("popstate", back);
      window.removeEventListener("pagehide", abandon);
      window.removeEventListener("pageshow", restore);
    };
  }, [ticket, stage]);
  useEffect(() => {
    if (!sound || stage !== "play") return;
    const song = new Audio(`/chemi/match/${character}.mp3`);
    song.loop = true;
    song.volume = 0.35;
    const play = () => { void song.play().catch(() => {}); };
    play();
    window.addEventListener("pointerdown", play, {once: true});
    return () => {
      window.removeEventListener("pointerdown", play);
      song.pause();
    };
  }, [sound, character, stage]);
  function ring(enable: boolean, frequency = 440) {
    if (!enable) return;
    try {
      audio.current ??= new AudioContext();
      const context = audio.current;
      void context.resume().catch(() => {});
      const tone = context.createOscillator(),
        gain = context.createGain();
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09);
      tone.connect(gain).connect(context.destination);
      tone.start();
      tone.stop(context.currentTime + 0.1);
    } catch {
      /* Audio can be unavailable on devices with restricted playback. */
    }
  }
  function toggleSound() {
    const next = !sound;
    ring(next);
    if (!auth.authenticated) {
      setSound(next);
      return;
    }
    void action(async () => {
      const data = await call<{ sound: boolean }>({
        action: "sound",
        sound: next,
      });
      setSound(data.sound);
    });
  }
  function leave() {
    void action(async () => {
      if (ticket && auth.authenticated)
        await call({ action: "leave", playId: ticket.playId });
      writePending(null);
      setTicket(null);
      setStage("start");
    });
  }
  function back() {
    if (stage === "play") {
      setStage("pause");
      return;
    }
    if (stage === "pause") {
      setStage("play");
      return;
    }
    if (stage === "reminder") {
      setStage("empty");
      return;
    }
    if (stage === "guide") {
      setStage("start");
      return;
    }
    if (stage !== "start") {
      setTicket(null);
      setStage("start");
      return;
    }
    location.assign("/chemi?locale=" + encodeURIComponent(locale));
  }
  async function shareResult() {
    if (!result?.shareId) return;
    const url = new URL(location.href);
    url.searchParams.set("share", result.shareId);
    try {
      if (navigator.share)
        await navigator.share({ title: copy.challenge, url: url.href });
      else {
        await navigator.clipboard.writeText(url.href);
        setCopied(true);
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError("error");
    }
  }
  const art = photos[character];
  const rankingLoaded =
    share && stage === "start"
      ? Boolean(challenge)
      : Boolean(lobby || challenge || publicRows);
  const rows =
    share && stage === "start"
      ? (challenge?.ranking ?? [])
      : (lobby?.ranking ?? challenge?.ranking ?? publicRows ?? []);
  const faces = facesFor(character);
  const paidStart = lobby?.freeRemaining === 0 && lobby.extraRemaining > 0 && lobby.extraCost > 0;
  const active = stage === "play" && view;
  const levelList = <ol className={styles.levelList} aria-label={copy.round}>
    {LEVELS.map(({columns, pairs, seconds}, i) => {
      const rows = Math.ceil(pairs * 2 / columns);
      return <li data-row="" key={pairs} aria-current={active && active.stage === i+1 ? "step" : undefined}
        aria-label={`${copy.round} ${i + 1} · ${fill(copy.goal, { n: pairs, s: seconds })}`}>
        <span className={styles.stepName} aria-hidden="true">
          <b>{i + 1}</b>
          {!active && <span className={styles.stepGrid} style={{ "--columns": columns } as CSSProperties}>
            {Array.from({ length: columns * rows }, (_, cell) => <i key={cell} />)}
          </span>}
        </span>
        {!active && <span className={styles.levelGoal} aria-hidden="true"><FanNumUnit>{pairs}{copy.pairUnit}</FanNumUnit><FanNumUnit>{seconds}{copy.secondUnit}</FanNumUnit></span>}
      </li>;
    })}
  </ol>;
  const isTrial = Boolean(share && !auth.authenticated);
  const scene = (
    <div className={styles.scene}>
      <Image
        width={1440}
        height={550}
        sizes="(min-width: 768px) 50vw, 100vw"
        alt=""
        src={art.scene}
        data-character={character}
      />
    </div>
  );
  const tallScene = art.lobby ? (
    <div className={styles.scene} data-tall="">
      <Image width={1440} height={550} sizes="100vw" alt="" src={art.scene} data-character={character} />
      <Image width={1440} height={1920} sizes="60vw" alt="" src={art.lobby} data-wide="" />
    </div>
  ) : scene;
  const myRow = rows.find(row => row.isMe);
  const extraCopy = getExtraPlayCopy(locale, lobby?.extraCost ?? 0);
  const title = {
    start: share ? copy.challenge : copy.title,
    guide: copy.guideTitle,
    play: copy.title,
    result: copy.result,
    empty: copy.title,
    pause: copy.pause,
    reminder: copy.reminder,
  }[stage];
  return (
    <main className={styles.shell} data-stage={stage}>
      <ExtraPlayDialog open={paying} onOpenChange={setPaying} busy={working} locale={parseAppLocale(locale)}
        points={lobby?.points} cost={lobby?.extraCost ?? 0} extraRemaining={lobby?.extraRemaining ?? 0} art={art.portrait}
        onConfirm={() => { setPaying(false); void start(character, true); }} />
      <header className={styles.header}>
        <FanIconButton type="button" aria-label={copy.back} onClick={back}>
          <FanIcon icon={ChevronLeft} />
        </FanIconButton>
        <FanHeading as="h1">{active ? copy.round + " " + active.stage + " / 5" : title}</FanHeading>
        <span className={styles.tools}>
          <FanIconButton
            type="button"
            disabled={working}
            aria-label={copy.sound}
            aria-pressed={sound}
            onClick={toggleSound}
          >
            <FanIcon icon={sound ? Volume2 : VolumeX} />
          </FanIconButton>
          {active && (
            <FanIconButton
              type="button"
              aria-label={copy.pause}
              onClick={() => setStage("pause")}
            >
              <FanIcon icon={Pause} />
            </FanIconButton>
          )}
        </span>
      </header>
      {error && stage !== "result" && (
        <div role="alert" className={styles.error}>
          <FanText role="item">{copy[error]}</FanText>
          {error === "authExpired" ? (
            <FanAction onClick={() => auth.login()}>{copy.signIn}</FanAction>
          ) : stage === "start" && (
            <FanAction onClick={() => setLoad((v) => v + 1)}>
              {copy.retry}
            </FanAction>
          )}
        </div>
      )}
      <div className={styles.layout} data-lobby={stage === "start" && !share} data-playing={Boolean(active)}>
        <section className={styles.content}>
          {stage === "start" &&
            (share ? (
              <>
                {scene}
                <FanHeading as="h2">{copy.challenge}</FanHeading>
                {challenge && (
                  <p>
                    {rankName(challenge.nickname, locale)} · {copy.record}{" "}
                    {clock(challenge.ticks)}
                  </p>
                )}
                <StageAction
                  disabled={
                    working || !challenge || (isTrial && !challenge.available)
                  }
                  onClick={() => void start(character)}
                >
                  {isTrial ? copy.trial : copy.start}
                </StageAction>
                {isTrial && challenge && !challenge.available && (
                  <FanAction onClick={() => auth.login()}>
                    {copy.signIn}
                  </FanAction>
                )}
              </>
            ) : (
              <>
                {ended && lobby && (
                  <p role="status" className={styles.ended}>
                    <FanText role="item">{copy.prevEnded}</FanText>
                    <FanText role="meta">{copy.freePlays} {lobby.freeRemaining}</FanText>
                  </p>
                )}
                <div className={styles.choices} role="group" aria-label={copy.choose}>
                  {characters.map((c) => (
                    <FanAction
                      variant="text"
                      type="button"
                      key={c}
                      disabled={
                        working || !auth.ready || (auth.authenticated && !lobby)
                      }
                      aria-pressed={character === c}
                      onClick={() => setCharacter(c)}
                    >
                      <Image
                        width={348}
                        height={464}
                        sizes="(min-width: 768px) 210px, 33vw"
                        alt=""
                        src={photos[c].portrait}
                      />
                      <FanText role="item">{copy[c]}</FanText>
                    </FanAction>
                  ))}
                </div>
                <div className={styles.lobbyHero}>
                  {tallScene}
                  {/* 기획 08-1: 판 정보의 '음악' 줄. 이름표를 붙여 사진 설명으로 읽히지 않게 한다. */}
                  <p><FanIcon icon={Music2} size={16} /><FanText role="meta">{locale === "ko" ? "배경음악" : copy.sound} ·</FanText> <FanText role="label">{(locale === "ko" ? ["매직 퍼즐 1", "매직 퍼즐 2", "코지 퍼즐 1"] : ["Magic Puzzle 1", "Magic Puzzle 2", "Cozy Puzzle 1"])[characters.indexOf(character)]}</FanText></p>
                </div>
                <section className={styles.roundTable}><FanHeading as="h2">{locale === "ko" ? `${LEVELS.length}라운드` : `${copy.round} · ${LEVELS.length}`}</FanHeading>
                {levelList}</section>
                <div className={styles.startAction}>
                  <StageAction disabled={working || !auth.ready || (auth.authenticated && !lobby)} loading={working} onClick={() => paidStart ? setPaying(true) : void start(character)}
                    helperText={lobby ? `${copy.freePlays} ${lobby.freeRemaining}` : undefined}>
                    {paidStart ? (locale === "ko" ? `${lobby.extraCost}P로 한 판` : extraCopy.cta) : copy.start}
                  </StageAction>
                  <FanAction variant="secondary" onClick={() => { setPracticed(false); setStage("guide"); }}>{copy.howTo}</FanAction>
                </div>
                {lobby?.previous && (
                  <p className={styles.detail}>
                    {copy.lastWeek} <b>{lobby.previous.place}</b>
                  </p>
                )}
              </>
            ))}
          {stage === "guide" && (
            <>
              <ol className={styles.rules}>
                {([[copy.rulePreview, copy.rulePreviewMeta], [copy.ruleFlip, copy.ruleFlipMeta], [copy.ruleScore, copy.ruleScoreMeta]] as const).map(([rule, meta], i) => (
                  <li data-row="" key={rule}>
                    <b>{i + 1}</b>
                    <FanText role="item">{rule}</FanText>
                    <FanText role="meta">{meta}</FanText>
                  </li>
                ))}
              </ol>
              <FanText role="label" className={styles.practiceLabel}>{copy.practice}</FanText>
              <Practice faces={art.cards} copy={copy} onDone={() => setPracticed(true)} />
              <div className={styles.startAction}>
                {practiced ? (
                  <StageAction disabled={working} onClick={() => void start(character, false, true)}
                    helperText={lobby ? `${copy.freePlays} ${lobby.freeRemaining}` : undefined}>
                    {copy.start}
                  </StageAction>
                ) : (
                  <FanAction disabled={working} onClick={() => void start(character, false, true)}>{copy.skip}</FanAction>
                )}
              </div>
            </>
          )}
          {active && (
            <>
              <div className={styles.stageLine}><span>{copy.record}</span><strong className={numberStyles.xl}>{active.score.toLocaleString(locale)}</strong>
                <FanText role="label" className={styles.status} aria-live="polite" data-tone={active.preview ? "preview" : active.second >= 0 ? "wrong" : undefined}>
                  {active.preview ? `${copy.memorize} · ${active.preview}` : active.second >= 0 ? copy.wrong
                    : fill(copy.goal, { n: LEVELS[active.stage - 1].pairs, s: LEVELS[active.stage - 1].seconds })}
                </FanText>
              </div>
              <progress aria-label={copy.time} data-urgent={active.remaining <= FPS * 10} value={active.remaining} max={LEVELS[active.stage-1].seconds * FPS} />
              <dl className={styles.hud} data-urgent={active.remaining <= FPS * 10}>
                <div>
                  <FanText as="dt" role="meta">
                    {copy.time}
                  </FanText>
                  <dd className={numberStyles.xl}>{clock(active.remaining)}</dd>
                </div>
                <div>
                  <FanText as="dt" role="meta">
                    {copy.pairs}
                  </FanText>
                  <dd className={numberStyles.xl}>
                    {active.stagePairs} / {LEVELS[active.stage-1].pairs}
                  </dd>
                </div>
                <div>
                  <FanText as="dt" role="meta">
                    {copy.attempts}
                  </FanText>
                  <dd className={numberStyles.xl}>{active.attempts}</dd>
                </div>
              </dl>
              {levelList}
              <div className={styles.board} data-columns={LEVELS[active.stage-1].columns}>
                {Array.from({ length: active.layout.length + Number(active.stage === 1) }, (_, cell) => {
                  if (active.stage === 1 && cell === 4)
                    return (
                      <div className={styles.middle} key="round">
                        <Image
                          width={112}
                          height={112}
                          alt={copy[character]}
                          src={art.portrait}
                        />
                        <FanText role="meta">{copy.round}</FanText>
                        <b>{active.stage} / {LEVELS.length}</b>
                      </div>
                    );
                  const index = active.stage === 1 && cell > 4 ? cell - 1 : cell;
                  const matched = Boolean(active.matched & (1 << index));
                  const open =
                    active.preview > 0 ||
                    matched ||
                    active.first === index ||
                    active.second === index;
                  const photo = active.layout[index];
                  return (
                    <MatchCard
                      key={cell}
                      open={open}
                      matched={matched}
                      wrong={active.second >= 0 && (active.first === index || active.second === index)}
                      src={faces[photo]}
                      faceNumber={LEVELS[active.stage - 1].pairs > photos[character].cards.length ? photo + 1 : undefined}
                      onReady={cardReady}
                      number={cell + 1}
                      wrongLabel={copy.wrong}
                      disabled={active.preview > 0 || matched || active.first === index || active.second >= 0}
                      label={[
                        copy.card,
                        cell + 1,
                        matched ? copy.matched : open ? copy.openCard : copy.closedCard,
                        ...(open ? [photo + 1] : []),
                      ].join(" ")}
                      onClick={() => {
                        const isSecond = active.first >= 0;
                        const paired = isSecond && active.layout[active.first] === photo;
                        ring(sound, isSecond ? (paired ? 784 : 220) : 440);
                        tap(index);
                      }}
                    />
                  );
                })}
              </div>
              {active.cleared && <ClearDialog label={copy.completed} recordLabel={copy.record} art={art.scene} portrait={art.portrait} name={copy[character]}
                round={active.stage} rounds={LEVELS.length} score={active.score} locale={locale}
                lines={[[copy.pairs, active.stagePairs * 100], [copy.clearBonus, 500], [copy.time, Math.floor(active.remaining / FPS) * 10], [copy.accuracy, Math.floor(active.stagePairs ** 2 * 100 / active.attempts)]]}>
                {active.stage < LEVELS.length && (
                  <FanText as="p" role="meta" className={styles.nextGoal}>
                    {fill(copy.nextGoal, { n: LEVELS[active.stage].pairs, s: LEVELS[active.stage].seconds })}
                  </FanText>
                )}
                <div className={styles.clearActions}>
                  <StageAction onClick={nextLevel}>{copy.round} {active.stage+1} · {copy.start}</StageAction>
                  <FanAction onClick={finishLevel}>{copy.result}</FanAction>
                </div>
              </ClearDialog>}
            </>
          )}
          {stage === "pause" && (
            <>
              {scene}
              <FanHeading as="h2">{copy.paused}</FanHeading>
              <StageAction onClick={() => setStage("play")}>
                {copy.continuePlay}
              </StageAction>
              <FanAction
                disabled={working}
                onClick={leave}
                helperText={copy.leaveHint}
              >
                {copy.leave}
              </FanAction>
            </>
          )}
          {stage === "empty" && (
            <>
              {tallScene}
              <FanHeading as="h2">{copy.exhausted}</FanHeading>
              <dl className={styles.facts}>
                <div>
                  <FanText as="dt" role="meta">{copy.nextFree}</FanText>
                  <dd className={numberStyles.xl}>{hms(untilKstMidnight(now))}</dd>
                </div>
                <div>
                  <FanText as="dt" role="meta">{copy.myRank}</FanText>
                  <dd>{myRow ? <><b>{copy.place.replace("{n}", String(myRow.place))}</b> · {myRow.score?.toLocaleString(locale) ?? clock(myRow.ticks)}</> : extraCopy.myEmpty}</dd>
                </div>
                {lobby && (
                  <div>
                    <FanText as="dt" role="meta">{extraCopy.left}</FanText>
                    <dd>{lobby.extraRemaining > 0
                      ? <b>{fillCount(extraCopy.count, lobby.extraRemaining)}</b>
                      : extraCopy.allUsed}</dd>
                  </div>
                )}
              </dl>
              <p className={styles.quote}>
                <Image width={112} height={112} alt="" src={art.portrait} />
                <span><b>{copy[character]}</b> {copy[DONE_LINE[character]]}</span>
              </p>
              <div className={styles.startAction}>
                {lobby?.extraRemaining && lobby.extraCost ? (
                  <>
                    <StageAction disabled={working} onClick={() => setPaying(true)}>
                      {extraCopy.cta}
                    </StageAction>
                    {reminders && <FanAction onClick={() => setStage("reminder")}>{copy.tomorrow}</FanAction>}
                  </>
                ) : reminders ? (
                  <StageAction onClick={() => setStage("reminder")}>{copy.tomorrow}</StageAction>
                ) : null}
                <FanAction variant={reminders || (lobby?.extraRemaining && lobby.extraCost) ? "text" : "primary"} href={`/chemi?locale=${locale}`}>{copy.toChemi}</FanAction>
              </div>
            </>
          )}
          {stage === "reminder" && (
            <>
              {scene}
              <FanHeading as="h2">
                {subscribed ? copy.subscribed : copy.reminder}
              </FanHeading>
              {subscribed && <p role="status">{copy.remindHint}</p>}
              {!subscribed && (
                <StageAction
                  helperText={copy.remindHint}
                  disabled={working}
                  onClick={() =>
                    void action(async () => {
                      await call({ kind: "tomorrow" }, "/api/chemi/reminders");
                      setSubscribed(true);
                    })
                  }
                >
                  {copy.subscribe}
                </StageAction>
              )}
              <FanAction onClick={back}>{copy.back}</FanAction>
            </>
          )}
          {stage === "result" && view && (
            <>
              <FanHeading as="h2">
                {copy[character]} ·{" "}
                {view.cleared ? copy.completed : copy.timeUp}
              </FanHeading>
              <div className={styles.stageLine}><span>{copy.record}</span><strong className={numberStyles.xl}>{view.score.toLocaleString(locale)}</strong></div>
              {pendingFinish && !working && (
                <div role="alert" className={styles.saveFail}>
                  <FanText role="item">{copy[error === "authExpired" ? "authExpired" : "saveFailed"]}</FanText>
                  <FanAction onClick={() => void submit(pendingFinish)}>{copy.retry}</FanAction>
                </div>
              )}
              {view.score === 0 ? <FanText role="body">{copy.zeroScore}</FanText> : <ScoreLines locale={locale} lines={[[copy.pairs, view.pairs * 100], [copy.clearBonus, view.clearPoints], [copy.time, view.timePoints], [copy.accuracy, view.accuracyPoints]]} />}
              <div className={styles.souvenir}>
                {photos[character].cards.slice(0, 5).map((src) => (
                  <Image
                    width={360}
                    height={480}
                    sizes="(min-width: 768px) 166px, 30vw"
                    alt=""
                    key={src}
                    unoptimized={src.startsWith("/chemi/match/")}
                    src={src}
                  />
                ))}
              </div>
              <dl className={styles.hud}>
                <div>
                  <FanText as="dt" role="meta">
                    {copy.time}
                  </FanText>
                  <dd className={numberStyles.xl}>{clock(view.tick)}</dd>
                </div>
                <div>
                  <FanText as="dt" role="meta">
                    {copy.misses}
                  </FanText>
                  <dd className={numberStyles.xl}>{view.misses}</dd>
                </div>
                {rows.some((r) => r.isMe) && (
                  <div>
                    <FanText as="dt" role="meta">
                      {copy.rank}
                    </FanText>
                    <dd className={numberStyles.xl}>
                      {priorRank !== null && priorRank !== rows.find(r => r.isMe)?.place && <>{priorRank} → </>}
                      {rows.find((r) => r.isMe)?.place}
                    </dd>
                  </div>
                )}
              </dl>
              {working && <FanSkeletonRows rows={1} ariaLabel={copy.loading} />}
              {result && auth.authenticated && (
                // 친밀 한 줄: 최애 런 결과와 같은 이름·자리(K-df2f2e 게임 = 신남).
                <div className={`${styles.detail} ${styles.gain}`}>
                  <Image width={112} height={112} alt="" src={art.portrait} />
                  <span>
                    <FanText role="item">{fill(copy.care, { name: copy[character] })}</FanText>
                    {result.excitement !== undefined && (
                      <FanText role="meta">{copy.excitement} +{result.excitement}</FanText>
                    )}
                  </span>
                  <FanText role="item" className={styles.gainValue}>{result.exp > 0 ? `+${result.exp.toLocaleString(locale)}` : copy.received}</FanText>
                  <FanSectionLink href={`/chemi?tab=growth&locale=${locale}&character=${character}`}>{fill(copy.roomOf, { name: copy[character] })}</FanSectionLink>
                </div>
              )}
              {result?.titleStage && <div className={styles.detail}>
                <b>{copy.round} {result.titleStage} · {copy.completed}</b>
                <FanAction disabled={working || equipped} onClick={() => void action(async () => {
                  await call({action: "equip", stage: result.titleStage});
                  setEquipped(true);
                })}>{equipped && <FanIcon icon={Check} size={16} />}{copy.equip}</FanAction>
              </div>}

              {result && (
                <StageAction
                  onClick={() => {
                    if (isTrial) auth.login();
                    else {
                      setTicket(null);
                      setStage(lobby?.freeRemaining ? "start" : "empty");
                    }
                  }}
                >
                  {isTrial ? copy.signIn : copy.playAgain}
                </StageAction>
              )}
              {result && !isTrial && <FanAction href={`/chemi?locale=${locale}`}>{copy.back}</FanAction>}
              {result?.shareId && (
                <FanAction onClick={() => void shareResult()}>
                  {copied ? copy.copied : copy.share}
                </FanAction>
              )}
            </>
          )}
        </section>
        {stage !== "empty" && stage !== "pause" &&
          stage !== "reminder" && stage !== "guide" &&
          (rankingLoaded ? (
            <Rankings rows={rows} copy={copy} full={Boolean(active)} locale={locale} />
          ) : (
            <section aria-busy={!error} className={styles.ranking}>
              <FanHeading as="h2">{copy.ranking}</FanHeading>
              {!error && <FanSkeletonRows rows={3} ariaLabel={copy.loading} />}
            </section>
          ))}
      </div>
    </main>
  );
}
