"use client";

import { rankName } from "@/features/chemi/games/rank-name";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { ChevronLeft, Volume2, VolumeX } from "@/components/fan-ui/fan-icons";
import { ExtraPlayDialog } from "@/features/chemi/ui/extra-play-dialog";
import { FanText } from "@/components/fan-ui/fan-text";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import type { AppLocale } from "@/i18n/locales";
import { GROUP_WALLET_CHANGED_EVENT } from "@/features/groups/ui/wallet-events";
import { fill, getRunCopy, type RunCopy } from "./copy";
import { ART_FILES, loadArt } from "./render";
import { ResultStage } from "./result";
import { SelectStage } from "./select";
import type { Challenge, Character, Lobby, Rank, Result, Stage } from "./shared";

/** A lobby that has not answered by then shows the error line and its retry instead of waiting with no numbers. */
const LOBBY_TIMEOUT_MS = 20_000;
import { createSound } from "./sound";
import { Track, type RunStats, type Submission, type Ticket } from "./track";
import styles from "./run.module.css";
import { useChemiFeatures } from "@/features/chemi/domain/features";

class RunRequestError extends Error {
  constructor(readonly status: number, code: string) {
    super(code);
  }
}

export function RunScreen(props: { locale: AppLocale; share: string | null }) {
  const auth = useByUsAuth();
  return <Session key={auth.user?.id ?? "guest"} {...props} auth={auth} />;
}

function Session({ locale, share, auth }: { locale: AppLocale; share: string | null; auth: ReturnType<typeof useByUsAuth> }) {
  const [lobby, setLobby] = useState<Lobby>();
  const [character, setCharacter] = useState<Character>("changha");
  const copy = useMemo(() => getRunCopy(locale, lobby?.extraCost, character), [locale, lobby?.extraCost, character]);
  const names: Record<Character, string> = { changha: copy.changha, elina: copy.elina, yuna: copy.yuna };
  const number = new Intl.NumberFormat(locale);
  const [stage, setStage] = useState<Stage>("select");
  const [publicRows, setPublicRows] = useState<Rank[]>();
  const [challenge, setChallenge] = useState<Challenge>();
  const [ticket, setTicket] = useState<Ticket>();
  const [rerun, setRerun] = useState(false);
  const [stats, setStats] = useState<RunStats>();
  const [result, setResult] = useState<Result>();
  const [before, setBefore] = useState<{ place?: number; best: number }>({ best: 0 });
  const [submission, setSubmission] = useState<Submission>();
  const [failed, setFailed] = useState<"load" | "finish" | "share" | "remind" | "start" | null>(null);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [paying, setPaying] = useState(false);
  const [allRanks, setAllRanks] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reminded, setReminded] = useState(false);
  const { reminders } = useChemiFeatures();
  const [pauseRequest, setPauseRequest] = useState(0);
  const sound = useMemo(createSound, []);
  const pendingStart = useRef<{
    key: string;
    character: Character;
    trial: boolean;
    shareId: string | null;
    extra: boolean;
    expectedCost?: number;
  } | null>(null);
  const starting = useRef(false);
  const getter = useRef(auth.getAccessToken);
  getter.current = auth.getAccessToken;

  const call = useCallback(async <T,>(body: object, member = false, path = "/api/chemi/games?game=run", timeout?: number): Promise<T> => {
    const token = member ? await getter.current() : null;
    const response = await fetch(path, {
      method: "POST",
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new RunRequestError(response.status, String(data?.error ?? response.status));
    }
    return response.json();
  }, []);
  const load = useCallback(async (clearError = true) => {
    if (!auth.ready) return;
    if (clearError) setFailed(null);
    try {
      if (auth.authenticated) {
        const data = await call<Lobby>({ action: "lobby" }, true, undefined, LOBBY_TIMEOUT_MS);
        setLobby(data);
        setSoundOn(data.sound);
        sound.set(data.sound);
      } else setPublicRows((await call<{ ranking: Rank[] }>({ action: "ranking" }, false, undefined, LOBBY_TIMEOUT_MS)).ranking);
      if (share) setChallenge(await call<Challenge>({ action: "challenge", shareId: share }).catch(() => undefined));
    } catch {
      setFailed("load");
    }
  }, [auth.ready, auth.authenticated, call, share, sound]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    document.addEventListener("visibilitychange", sound.visibility);
    return () => { document.removeEventListener("visibilitychange", sound.visibility); sound.close(); };
  }, [sound]);
  useEffect(() => {
    // The choose screen previews the picked 최애's running song; the run keeps it going from there.
    if (stage !== "run") sound.music(character, stage === "result" ? "result" : "run");
  }, [sound, stage, character]);
  useEffect(() => { void loadArt().catch(() => {}); }, []);

  // Back during a run opens the pause veil instead of leaving the page.
  useEffect(() => {
    if (stage !== "run") return;
    history.pushState({ ...history.state, runGuard: true }, "", location.href);
    const back = () => {
      history.pushState({ ...history.state, runGuard: true }, "", location.href);
      setPauseRequest((value) => value + 1);
    };
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, [stage]);

  const rows = lobby?.ranking ?? publicRows ?? challenge?.ranking ?? [];
  const loaded = Boolean(lobby || publicRows);
  const trial = !auth.authenticated && Boolean(challenge?.available);
  const free = lobby?.freeRemaining ?? 0;

  async function begin(paid = false) {
    if (busy || starting.current) return;
    if (!pendingStart.current) {
      if (!auth.authenticated && !trial) return auth.login();
      if (auth.authenticated && !lobby) return;
      if (paid && !lobby?.extraCost) return;
      pendingStart.current = {
        key: crypto.randomUUID(), character, trial, shareId: share,
        extra: paid, expectedCost: paid ? lobby?.extraCost : undefined,
      };
    }
    const start = pendingStart.current;
    const cost = start.expectedCost ?? 0;
    starting.current = true;
    setBusy(true);
    setFailed(null);
    // Close the extra-run sheet before the run's back guard is listening.
    setPaying(false);
    try {
      const issued = await call<Ticket & { issuedAt: string }>(start.trial
        ? { action: "trial", key: start.key, shareId: start.shareId }
        : { action: "start", game: "run", character: start.character, key: start.key, extra: start.extra, expectedCost: start.expectedCost }, !start.trial);
      if (!issued?.playId || !issued.issuedAt || !Number.isInteger(issued.seed)) throw new Error("Invalid run ticket");
      pendingStart.current = null;
      setBefore({ place: lobby?.ranking.find((row) => row.isMe)?.place, best: lobby?.best ?? 0 });
      setLobby((now) => now && { ...now, freeRemaining: Math.max(0, now.freeRemaining - (start.extra ? 0 : 1)), points: now.points - cost });
      setResult(undefined);
      setStats(undefined);
      setSubmission(undefined);
      setCopied(false);
      setTicket({ ...issued, trial: start.trial, spentPoints: start.expectedCost });
      setRerun(stage === "result");
      setStage("run");
      if (start.extra && !start.trial) window.dispatchEvent(new Event(GROUP_WALLET_CHANGED_EVENT));
    } catch (error) {
      setFailed("start");
      if (error instanceof RunRequestError && error.status >= 400 && error.status < 500
        && error.status !== 408 && error.status !== 429
        && error.message !== "CHEMI_UNAVAILABLE" && error.message !== "CHEMI_RUN_START_RETRY") {
        pendingStart.current = null;
        if (auth.authenticated) void load(false);
      }
    } finally {
      starting.current = false;
      setBusy(false);
    }
  }
  async function finish(body: Submission, played?: RunStats) {
    if (played) setStats(played);
    setSubmission(body);
    setStage("result");
    setBusy(true);
    setFailed(null);
    try {
      if (ticket?.trial) {
        setResult({ score: body.score, exp: 0 });
        setChallenge((now) => now && { ...now, available: false });
      } else {
        setResult(await call<Result>({ action: "finish", ...body, moves: [] }, true));
        await load();
      }
      setSubmission(undefined);
    } catch {
      setFailed("finish");
    } finally {
      setBusy(false);
    }
  }
  function toggleSound() {
    sound.unlock();
    const next = !soundOn;
    setSoundOn(next);
    sound.set(next);
    sound.play("note");
    if (auth.authenticated) void call({ action: "sound", sound: next }, true).catch(() => {});
  }
  function back() {
    if (stage === "run") setPauseRequest((value) => value + 1);
    else if (stage === "result") { setTicket(undefined); setStage("select"); }
    else location.assign(`/chemi?locale=${encodeURIComponent(locale)}`);
  }
  async function shareResult() {
    if (!result?.shareId) return;
    setFailed(null);
    const url = new URL(location.href);
    url.searchParams.set("share", result.shareId);
    try {
      if (navigator.share) await navigator.share({ title: copy.title, url: url.href });
      else { await navigator.clipboard.writeText(url.href); setCopied(true); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setFailed("share");
    }
  }
  function again() {
    if (pendingStart.current) return void begin();
    if (!auth.authenticated) return auth.login();
    if (free > 0) void begin();
    else setPaying(true);
  }

  // Signed in but the lobby has not answered: no count or price is known yet, so the button waits as a placeholder.
  const waiting = auth.authenticated && !lobby;
  const startLabel = !auth.ready ? copy.go : !auth.authenticated
    ? (trial ? copy.trial : copy.login)
    : free > 0 ? fill(copy.start, { name: names[character], n: free })
      : copy.extraCta;
  const spent = Boolean(lobby && free <= 0 && !lobby.extraCost);
  const footer = [lobby && lobby.players > 0 ? fill(copy.players, { n: number.format(lobby.players) }) : "",
    lobby?.previous ? fill(copy.lastWeek, { n: lobby.previous.place }) : ""].filter(Boolean).join(" · ");
  async function remind() {
    setFailed(null);
    try { await call({ kind: "tomorrow" }, true, "/api/chemi/reminders"); setReminded(true); } catch { setFailed("remind"); }
  }
  const reminder = reminders && <FanAction disabled={busy || reminded} onClick={remind}>{reminded ? copy.reminded : copy.remind}</FanAction>;
  const failureSubject = failed === "share" ? copy.challenge : failed === "remind" ? copy.remind : failed === "finish" ? copy.score : failed === "start" ? copy.go : copy.ranking;
  function retryFailed() {
    if (failed === "finish" && submission) void finish(submission);
    else if (failed === "share") void shareResult();
    else if (failed === "remind") void remind();
    else if (failed === "start") again();
    else void load();
  }
  const failureMessage = locale === "ko" && failed === "finish" ? "이번 판의 점수를 저장하지 못했어요."
    : locale === "ko" && failed === "load" ? "이번 주 순위를 불러오지 못했어요."
    : `${failureSubject} · ${copy.error}`;
  const errorLine = failed && <div className={styles.error} role="alert">
    <FanText role="meta">{failureMessage}</FanText>
    <FanAction size="sm" disabled={busy} onClick={retryFailed}>{copy.retry}</FanAction>
  </div>;

  if (stage === "run" && ticket) return <main data-chemi-run="" className={styles.shell} lang={locale} data-stage="run">
    <Track character={character} key={ticket.playId} ticket={ticket} copy={copy} locale={locale} name={names[character]} sound={sound} soundOn={soundOn}
      onToggleSound={toggleSound} pauseRequest={pauseRequest} rerun={rerun} onFinish={(body, played) => void finish(body, played)} />
  </main>;

  return <main data-chemi-run="" className={styles.shell} lang={locale} data-stage={stage}>
    <header className={styles.nav}>
      <FanIconButton aria-label={copy.back} onClick={back}><FanIcon icon={ChevronLeft} /></FanIconButton>
      <FanHeading as="h1">{copy.title}</FanHeading>
      <FanIconButton aria-label={copy.sound} aria-pressed={soundOn} onClick={toggleSound}><FanIcon icon={soundOn ? Volume2 : VolumeX} /></FanIconButton>
    </header>
    {stage === "select" && <SelectStage character={character} pickDisabled={!auth.ready || busy || Boolean(pendingStart.current)} onPick={(who) => { sound.unlock(); setCharacter(who); }} copy={copy} locale={locale} names={names} rows={rows} loaded={loaded} loading={!loaded && !failed} footer={footer}
      challenge={challenge} waiting={waiting} spent={spent} startLabel={startLabel} startDisabled={!auth.ready || busy || (auth.authenticated && !lobby)}
      onStart={() => !pendingStart.current && auth.authenticated && free <= 0 ? setPaying(true) : void begin()} onAllRanks={() => setAllRanks(true)}
      errorLine={errorLine} reminder={reminder} />}
    {stage === "result" && <ResultStage character={character} copy={copy} locale={locale} names={names} rows={rows} loaded={loaded} stats={stats} result={result}
      before={before} saving={busy && !result} trial={Boolean(ticket?.trial)} member={auth.authenticated} spent={spent} free={free}
      busy={busy} copied={copied} onAgain={again} onLogin={() => auth.login()} onShare={() => void shareResult()}
      onAllRanks={() => setAllRanks(true)} errorLine={errorLine} reminder={reminder} />}
    <ExtraPlayDialog open={paying} onOpenChange={setPaying} onConfirm={() => void begin(true)}
      busy={busy} locale={locale} points={lobby?.points} cost={lobby?.extraCost ?? 0} />
    <FanDialog open={allRanks} onOpenChange={setAllRanks} title={copy.ranking} closeLabel={copy.close} size="sm" responsive>
      <ol className={styles.allRanks}>
        {rows.map((row) => <li data-row="" key={row.place} data-me={row.isMe}>
          <FanText role="label">{row.place}</FanText>
          <FanText role="item">{rankName(row.nickname, locale)}{row.isMe && ` (${copy.me})`} · {names[row.character]}</FanText>
          <FanText role="item">{number.format(row.score)}</FanText>
        </li>)}
      </ol>
    </FanDialog>
    <link rel="preload" as="image" href={ART_FILES.street} />
  </main>;
}
