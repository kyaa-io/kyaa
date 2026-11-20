"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { FanText } from "@/components/fan-ui/fan-text";
import numberStyles from "@/components/fan-ui/fan-number.module.css";
import type { ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import {
  Check,
  ChevronLeft,
  Pause,
  Volume2,
  VolumeX,
} from "@/components/fan-ui/fan-icons";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { FPS } from "@/features/chemi/games/engine";
import type { MatchCopy } from "./copy";
import { useMatchRound, type Submission, type Ticket } from "./use-match-round";
import styles from "./match.module.css";

const characters = ["changha", "elina", "yuna"] as const;
type Character = (typeof characters)[number];
type Photos = Record<
  Character,
  {
    portrait: string;
    scene: string;
    cards: readonly [string, string, string, string];
  }
>;
type Stage = "start" | "play" | "pause" | "result" | "empty" | "reminder";
type Row = {
  nickname: string;
  character: Character;
  place: number;
  ticks: number;
  misses: number;
  isMe: boolean;
  isFriend?: boolean;
};
type Lobby = {
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
type Finish = { score: number; exp: number; shareId?: string };
type Props = {
  copy: MatchCopy;
  locale: string;
  share: string | null;
  photos: Photos;
};

function StageAction({
  children,
  disabled,
  helperText,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  helperText?: string;
  onClick: () => void;
}) {
  return (
    <FanAction
      variant="primary"
      disabled={disabled}
      onClick={onClick}
      helperText={helperText}
    >
      {children}
    </FanAction>
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
}: {
  rows: Row[];
  copy: MatchCopy;
  full: boolean;
}) {
  const me = rows.find((row) => row.isFriend) ?? rows.find((row) => row.isMe);
  const displayed = full ? rows : rows.slice(0, 3);
  const mineOutside = me && !displayed.includes(me);
  return (
    <section className={styles.ranking} aria-label={copy.ranking}>
      <FanHeading as="h2">{copy.ranking}</FanHeading>
      {!rows.length && <p>{copy.emptyRanking}</p>}
      <ol>
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
              {Array.from(row.nickname)[0]}
            </span>
            <span>
              {row.nickname}
              {(row.isMe || row.isFriend) && (
                <small> · {row.isFriend ? copy.friend : copy.me}</small>
              )}
            </span>
            <FanText role="meta">{copy[row.character]}</FanText>
            <b>{clock(row.ticks)}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}

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
  const [result, setResult] = useState<Finish | null>(null);
  const [pendingFinish, setPendingFinish] = useState<Submission | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [sound, setSound] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [load, setLoad] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const inFlight = useRef(false);
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
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.error ?? response.status));
      return data;
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
        .catch(() => {
          if (active) setError(copy.error);
        });
    if (!auth.authenticated && !share) {
      void call<{ ranking: Row[] }>({ action: "ranking" }, undefined, true)
        .then((data) => {
          if (active) setPublicRows(data.ranking);
        })
        .catch(() => {
          if (active) setError(copy.error);
        });
    }
    if (auth.authenticated)
      void call<Lobby>({ action: "lobby" })
        .then((data) => {
          if (active) {
            setLobby(data);
            setSound(data.sound);
          }
        })
        .catch(() => {
          if (active) setError(copy.error);
        });
    return () => {
      active = false;
    };
  }, [auth.ready, auth.authenticated, call, share, load, copy.error]);
  useEffect(
    () => () => {
      void audio.current?.close().catch(() => {});
    },
    [],
  );

  async function action(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(
        String(e).includes("INSUFFICIENT") ? copy.insufficient : copy.error,
      );
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }
  async function start(who: Character, extra = false) {
    if (!auth.authenticated && !share) {
      auth.login();
      return;
    }
    setCharacter(who);
    if (!share && !extra && lobby?.freeRemaining === 0) {
      setStage("empty");
      return;
    }
    await action(async () => {
      const choice = who + ":" + extra;
      if (startKey.current.choice !== choice)
        startKey.current = { choice, key: crypto.randomUUID() };
      const trial = Boolean(share && !auth.authenticated);
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
          if (trial) {
            setChallenge((prev) => prev && { ...prev, available: false });
            return;
          }
          setStage("empty");
          if (auth.authenticated)
            setLobby(await call<Lobby>({ action: "lobby" }));
          return;
        }
        throw e;
      }
      startKey.current.choice = "";
      setTicket(next);
      setResult(null);
      setPendingFinish(null);
      setCopied(false);
      setStage("play");
      if (trial && challenge) setChallenge({ ...challenge, available: false });
      if (!trial)
        setLobby(
          (prev) =>
            prev && {
              ...prev,
              [extra ? "extraRemaining" : "freeRemaining"]: Math.max(
                0,
                prev[extra ? "extraRemaining" : "freeRemaining"] - 1,
              ),
            },
        );
    });
  }
  async function submit(body: Submission) {
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
    });
  }
  const { view, tap } = useMatchRound(ticket, stage !== "play", submit);
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
    const abandon = () => {
      if (accessToken.current)
        void fetch("/api/chemi/games", {
          method: "POST",
          keepalive: true,
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + accessToken.current,
          },
          body: JSON.stringify({ action: "leave", playId: ticket.playId }),
        }).catch(() => {});
    };
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
  function ring(enable: boolean) {
    if (!enable) return;
    try {
      audio.current ??= new AudioContext();
      const context = audio.current;
      void context.resume().catch(() => {});
      const tone = context.createOscillator(),
        gain = context.createGain();
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
        setError(copy.error);
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
  const active = stage === "play" && view;
  const isTrial = Boolean(share && !auth.authenticated);
  const scene = (
    <div className={styles.scene}>
      <Image
        width={1040}
        height={550}
        sizes="(min-width: 768px) 520px, 100vw"
        alt=""
        src={art.scene}
        data-character={character}
      />
    </div>
  );
  const title = {
    start: share ? copy.challenge : copy.title,
    play: copy.title,
    result: copy.result,
    empty: copy.exhausted,
    pause: copy.pause,
    reminder: copy.reminder,
  }[stage];
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <FanIconButton type="button" aria-label={copy.back} onClick={back}>
          <FanIcon icon={ChevronLeft} />
        </FanIconButton>
        <FanHeading as="h1">{title}</FanHeading>
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
      </header>
      {error && (
        <div role="alert" className={styles.error}>
          {error}{" "}
          {stage === "start" && (
            <FanAction onClick={() => setLoad((v) => v + 1)}>
              {copy.retry}
            </FanAction>
          )}
        </div>
      )}
      <div className={styles.layout} data-playing={Boolean(active)}>
        <section className={styles.content}>
          {stage === "start" &&
            (share ? (
              <>
                {scene}
                <FanHeading as="h2">{copy.challenge}</FanHeading>
                {challenge && (
                  <p>
                    {challenge.nickname} · {copy.record}{" "}
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
                <FanHeading as="h2">{copy.choose}</FanHeading>
                <div className={styles.choices}>
                  {characters.map((c) => (
                    <FanAction
                      variant="text"
                      type="button"
                      key={c}
                      disabled={
                        working || !auth.ready || (auth.authenticated && !lobby)
                      }
                      onClick={() => void start(c)}
                    >
                      <Image
                        width={348}
                        height={464}
                        sizes="(min-width: 768px) 168px, 30vw"
                        alt=""
                        src={photos[c].portrait}
                      />
                      <FanText role="item">{copy[c]}</FanText>
                    </FanAction>
                  ))}
                </div>
                {lobby?.previous && (
                  <p className={styles.detail}>
                    {copy.lastWeek} <b>{lobby.previous.place}</b>
                  </p>
                )}
                {lobby && (
                  <p className={styles.detail}>
                    {copy.freePlays} <b>{lobby.freeRemaining} / 3</b>
                  </p>
                )}
              </>
            ))}
          {active && (
            <>
              <dl className={styles.hud}>
                <div>
                  <FanText as="dt" role="meta">
                    {copy.time}
                  </FanText>
                  <dd className={numberStyles.xl}>{clock(active.tick)}</dd>
                </div>
                <div>
                  <FanText as="dt" role="meta">
                    {copy.pairs}
                  </FanText>
                  <dd className={numberStyles.xl}>
                    {active.matched.toString(2).replace(/0/g, "").length / 2} /
                    4
                  </dd>
                </div>
                <div>
                  <FanText as="dt" role="meta">
                    {copy.misses}
                  </FanText>
                  <dd className={numberStyles.xl}>{active.misses}</dd>
                </div>
              </dl>
              <div className={styles.board}>
                {Array.from({ length: 9 }, (_, cell) => {
                  if (cell === 4)
                    return (
                      <div className={styles.middle} key="round">
                        <Image
                          width={112}
                          height={112}
                          alt={copy[character]}
                          src={art.portrait}
                        />
                        <FanText role="meta">{copy.round}</FanText>
                        <b>{active.stage} / 3</b>
                      </div>
                    );
                  const index = cell < 4 ? cell : cell - 1;
                  const matched = Boolean(active.matched & (1 << index));
                  const open =
                    matched ||
                    active.first === index ||
                    active.second === index;
                  const photo = active.layout[index];
                  return (
                    <div
                      className={styles.card}
                      data-open={open}
                      data-matched={matched}
                      key={cell}
                    >
                      <FanAction
                        variant="text"
                        disabled={
                          matched ||
                          active.first === index ||
                          active.second >= 0
                        }
                        ariaLabel={[
                          copy.card,
                          cell + 1,
                          matched
                            ? copy.matched
                            : open
                              ? copy.openCard
                              : copy.closedCard,
                          ...(open ? [photo + 1] : []),
                        ].join(" ")}
                        onClick={() => {
                          ring(sound);
                          tap(index);
                        }}
                      >
                        {open ? (
                          <Image
                            width={336}
                            height={448}
                            sizes="(min-width: 768px) 168px, 30vw"
                            src={art.cards[photo]}
                            alt=""
                          />
                        ) : (
                          <img
                            src="/images/guest-home/kyaa-wordmark.svg"
                            alt=""
                          />
                        )}
                        {matched && (
                          <i>
                            <FanIcon icon={Check} size={16} />
                          </i>
                        )}
                      </FanAction>
                    </div>
                  );
                })}
              </div>
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
              {scene}
              <FanHeading as="h2">{copy.exhausted}</FanHeading>
              {lobby && (
                <p>
                  {copy.extraPlays} {lobby.extraRemaining} / 3
                </p>
              )}
              <StageAction
                disabled={working || !lobby?.extraRemaining}
                onClick={() => void start(character, true)}
              >
                {lobby?.extraRemaining
                  ? copy.extraPlay + " · 10P"
                  : copy.noMore}
              </StageAction>
              <FanAction onClick={() => setStage("reminder")}>
                {copy.tomorrow}
              </FanAction>
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
                {view.pairs === 12 ? copy.completed : copy.timeUp}
              </FanHeading>
              <div className={styles.souvenir}>
                {art.cards.slice(0, 2).map((src) => (
                  <Image
                    width={360}
                    height={480}
                    sizes="(min-width: 768px) 166px, 30vw"
                    alt=""
                    key={src}
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
                      {rows.find((r) => r.isMe)?.place}
                    </dd>
                  </div>
                )}
              </dl>
              {working && <p role="status">{copy.loading}</p>}
              {result && result.exp > 0 && (
                <p className={styles.detail}>
                  {copy.experience}
                  <b>+{result.exp} EXP</b>
                </p>
              )}
              {pendingFinish && !working && (
                <FanAction onClick={() => void submit(pendingFinish)}>
                  {copy.retry}
                </FanAction>
              )}
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
              {result?.shareId && (
                <FanAction onClick={() => void shareResult()}>
                  {copied ? copy.copied : copy.share}
                </FanAction>
              )}
            </>
          )}
        </section>
        {stage !== "pause" &&
          stage !== "reminder" &&
          (rankingLoaded ? (
            <Rankings rows={rows} copy={copy} full={Boolean(active)} />
          ) : (
            <section aria-busy={!error} className={styles.ranking}>
              <FanHeading>{copy.ranking}</FanHeading>
              {!error && <p role="status">{copy.loading}</p>}
            </section>
          ))}
      </div>
    </main>
  );
}
