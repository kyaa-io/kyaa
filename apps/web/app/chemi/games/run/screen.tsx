"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { preload } from "react-dom";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { FPS } from "@/features/chemi/games/engine";
import { runRound } from "@/features/chemi/games/run";
import type { AppLocale } from "@/i18n/locales";
import { runCopy } from "./copy";
import styles from "./run.module.css";

const art = "/chemi/run";
const trackAssets = ["run-map-changha.jpg", "changha-run.png", "cone.png", "heart.png"];
type Ticket = { playId: string; seed: number; trial?: boolean };
type Rank = { place: number; nickname: string; score: number; isMe: boolean };
type Lobby = { freeRemaining: number; extraRemaining: number; ranking: Rank[] };
type Result = { score: number; exp: number; shareId?: string; title?: number };
type Challenge = { score: number; nickname: string; available: boolean };
type Submission = { playId: string; ticks: number; jumps: number[]; score: number };

export function RunScreen(props: { locale: AppLocale; share: string | null }) {
  for (const file of trackAssets) preload(`${art}/${file}`, { as: "image" });
  const auth = useByUsAuth();
  return <Session key={auth.user?.id ?? "guest"} {...props} auth={auth} />;
}

function Session({ locale, share, auth }: { locale: AppLocale; share: string | null; auth: ReturnType<typeof useByUsAuth> }) {
  const [title, start, rank, locked, free, extra, cap, jump, pause, resume, resultLabel,
    challengeLabel, copied, empty, retry, earned, login] = runCopy[locale];
  const [lobby, setLobby] = useState<Lobby>();
  const [ranking, setRanking] = useState<Rank[]>();
  const [challenge, setChallenge] = useState<Challenge>();
  const [ticket, setTicket] = useState<Ticket>();
  const [result, setResult] = useState<Result>();
  const [submission, setSubmission] = useState<Submission>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showRank, setShowRank] = useState(false);
  const requestKey = useRef<string | null>(null);
  const getter = useRef(auth.getAccessToken);
  getter.current = auth.getAccessToken;
  const call = useCallback(async <T,>(body: object, member = false): Promise<T> => {
    const token = member ? await getter.current() : null;
    const response = await fetch("/api/chemi/games?game=run", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw Error(String(response.status));
    return response.json();
  }, []);
  const load = useCallback(async () => {
    if (!auth.ready) return;
    setStatus("");
    try {
      if (auth.authenticated) {
        const data = await call<Lobby>({ action: "lobby" }, true);
        setLobby(data);
        setRanking(data.ranking);
      } else {
        setRanking((await call<{ ranking: Rank[] }>({ action: "ranking" })).ranking);
      }
      if (share) setChallenge(await call<Challenge>({ action: "challenge", shareId: share }));
    } catch {
      setStatus(retry);
    }
  }, [auth.ready, auth.authenticated, call, retry, share]);

  useEffect(() => { void load(); }, [load]);

  async function begin(paid = false) {
    if (busy) return;
    if (!auth.authenticated && !challenge?.available) return auth.login();
    if (auth.authenticated && !lobby) return;
    setBusy(true);
    setStatus("");
    try {
      const key = requestKey.current ??= crypto.randomUUID();
      const trial = !auth.authenticated;
      const issued = await call<Ticket>(trial
        ? { action: "trial", key, shareId: share }
        : { action: "start", game: "run", character: "changha", key, extra: paid }, !trial);
      requestKey.current = null;
      setResult(undefined);
      setConfirm(false);
      setTicket({ ...issued, trial });
    } catch (error) {
      if (error instanceof Error && Number(error.message) < 500) requestKey.current = null;
      setStatus(retry);
    } finally {
      setBusy(false);
    }
  }

  async function finish(body: Submission) {
    setSubmission(body);
    setBusy(true);
    setStatus("");
    try {
      setResult(ticket?.trial ? { score: body.score, exp: 0 } :
        await call<Result>({ action: "finish", ...body, moves: [] }, true));
      setSubmission(undefined);
      setTicket(undefined);
      if (ticket?.trial) setChallenge((current) => current && { ...current, available: false });
      else await load();
    } catch {
      setStatus(retry);
    } finally {
      setBusy(false);
    }
  }

  const distance = (score: number) => new Intl.NumberFormat(locale, { style: "unit", unit: "meter" }).format(score);
  const exhausted = Boolean(lobby && lobby.freeRemaining <= 0 && lobby.extraRemaining <= 0);
  return (
    <main className={styles.shell} lang={locale}>
      <header className={styles.header}>
        <a href={`/chemi?locale=${locale}`} aria-label="Chemi">←</a>
        <FanHeading as="h1">{title}</FanHeading>
        <FanAction onClick={() => setShowRank(!showRank)} aria-expanded={showRank}>{rank}</FanAction>
      </header>
      {ticket && <Track ticket={ticket} jump={jump} pause={pause} resume={resume} finish={finish} />}
      {submission && !busy && <FanAction onClick={() => void finish(submission)}>{retry}</FanAction>}
      {(!ticket || showRank) && <div className={styles.layout}>
        {!ticket && <section className={styles.course}>
          <img src={`${art}/${result ? "course-changha.jpg" : "select-changha.jpg"}`} alt="" />
          <div className={styles.characters}>
            <strong>{locale === "ko" ? "창하" : "Changha"}</strong>
            {["Elina", "Yuna"].map((name) => <span key={name} aria-disabled="true">{name} · {locked}</span>)}
          </div>
        </section>}
        <section className={styles.panel}>
          {result && <div className={styles.result}>
            <FanHeading>{resultLabel}</FanHeading>
            <FanNumber value={result.score} locale={locale} unit="m" size="xl" className={styles.distance} />
            {!ticket && auth.authenticated && <p>+{result.exp} EXP</p>}
            {result.title && <p>{earned.replace(/1[,. ]000|1\.000/g, new Intl.NumberFormat(locale).format(result.title))}</p>}
            {challenge && <p>{challenge.nickname} · {distance(challenge.score)}</p>}
            {result.shareId && <FanAction onClick={async () => {
              const url = new URL(location.href);
              url.searchParams.set("share", result.shareId!);
              try { await navigator.clipboard.writeText(url.href); setStatus(copied); }
              catch { setStatus(retry); }
            }}>{challengeLabel}</FanAction>}
          </div>}
          {!result && challenge && <p>{challenge.nickname} · {distance(challenge.score)}</p>}
          <FanHeading>{rank}</FanHeading>
          <ol className={styles.ranking}>
            {(showRank ? ranking : ranking?.filter((row) => row.place <= 3 || row.isMe))?.map((row) =>
              <li data-row key={row.place} value={row.place} data-me={row.isMe}>
                <span>{row.nickname}</span><strong>{distance(row.score)}</strong>
              </li>)}
          </ol>
          {ranking?.length === 0 && <p>{empty}</p>}
          {!ticket && <div className={styles.actions}>
            {lobby && <p>{free} · {lobby.freeRemaining}</p>}
            {exhausted ? <p role="status">{cap}</p> : confirm ? <>
              <FanAction disabled={busy} onClick={() => void begin(true)}>{extra} · {lobby?.extraRemaining}</FanAction>
              <FanAction onClick={() => setConfirm(false)}>×</FanAction>
            </> : <FanAction variant="primary" disabled={!auth.ready || busy || (auth.authenticated && !lobby)} onClick={() =>
              lobby?.freeRemaining === 0 ? setConfirm(true) : void begin()}>
              {!auth.authenticated && !challenge?.available ? login : lobby?.freeRemaining === 0 ? extra : start}
            </FanAction>}
          </div>}
        </section>
      </div>}
      {status && <p className={styles.status} role="status">{status === retry && !submission ? <FanAction onClick={() => void load()}>{status}</FanAction> : status}</p>}
    </main>
  );
}

function Track({ ticket, jump, pause, resume, finish }: { ticket: Ticket; jump: string; pause: string; resume: string; finish: (body: Submission) => void }) {
  const [view, setView] = useState(() => runRound(ticket.seed).state);
  const [paused, setPaused] = useState(false);
  const stopped = useRef(false);
  const finishRef = useRef(finish);
  const pressed = useRef(false);
  const held = useRef(false);
  finishRef.current = finish;

  useEffect(() => {
    const sim = runRound(ticket.seed);
    const jumps: number[] = [];
    let last = performance.now();
    let fraction = 0;
    let frameId = 0;
    function frame(now: number) {
      if (!stopped.current && !document.hidden) fraction += Math.min(100, now - last) * FPS / 1000;
      last = now;
      while (fraction >= 1 && !sim.state.done) {
        fraction--;
        const tick = sim.state.tick + 1;
        const input = (pressed.current || held.current) && tick - (jumps.at(-1) ?? -42) >= 42;
        pressed.current = false;
        if (input) jumps.push(tick);
        sim.step(input);
      }
      setView({ ...sim.state });
      if (sim.state.done) finishRef.current({ playId: ticket.playId, ticks: sim.state.tick, score: sim.state.score, jumps });
      else frameId = requestAnimationFrame(frame);
    }
    function keyDown(event: KeyboardEvent) {
      if (stopped.current || !["Space", "ArrowUp"].includes(event.code) ||
          (event.code === "Space" && event.target instanceof HTMLButtonElement)) return;
      event.preventDefault();
      if (!event.repeat) pressed.current = true;
      held.current = true;
    }
    function keyUp(event: KeyboardEvent) {
      if (["Space", "ArrowUp"].includes(event.code)) held.current = false;
    }
    function blur() { held.current = false; }
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
    };
  }, [ticket]);

  return <section className={styles.track}>
    <div className={styles.hud}>
      <span aria-label={`${view.hearts}/3`}>{Array.from({ length: 3 }, (_, i) =>
        <img key={i} src={`${art}/heart.png`} alt="" data-empty={i >= view.hearts} />)}</span>
      <strong>{view.score} m</strong>
      <FanAction disabled={view.done} onClick={() => { stopped.current = !paused; held.current = false; pressed.current = false; setPaused(!paused); }}>
        {paused ? resume : pause}
      </FanAction>
    </div>
    <div className={styles.runner} data-hit={view.invincible} style={{ "--run-bottom": `${18 + view.height * 16}%`, "--run-frame": `${-64 * (Math.floor(view.tick / 6) % 7)}px` } as CSSProperties} />
    {view.obstacle < 30 && <img className={styles.cone} src={`${art}/cone.png`} alt="" style={{ "--run-obstacle": `${18 + view.obstacle * 2.2}%` } as CSSProperties} />}
    <div className={styles.jump} onPointerDown={(event) => {
      if (paused || view.done) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      held.current = true;
      pressed.current = true;
    }} onLostPointerCapture={() => { held.current = false; }}>
      <FanAction fullWidth disabled={paused || view.done} onClick={(event) => {
        if (event.detail === 0) pressed.current = true;
      }}>{jump}</FanAction>
    </div>
  </section>;
}
