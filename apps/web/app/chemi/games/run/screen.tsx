"use client";

import { rankName } from "@/features/chemi/games/rank-name";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { ChevronLeft, Volume2, VolumeX } from "@/components/fan-ui/fan-icons";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanText } from "@/components/fan-ui/fan-text";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import type { AppLocale } from "@/i18n/locales";
import { celebrateSpend } from "@/components/fan-ui/reward-celebration";
import { fill, getRunCopy, type RunCopy } from "./copy";
import { ART_FILES, loadArt } from "./render";
import { ResultStage } from "./result";
import { SelectStage } from "./select";
import type { Challenge, Character, Lobby, Rank, Result, Stage } from "./shared";
import { createSound } from "./sound";
import { Track, type RunStats, type Submission, type Ticket } from "./track";
import styles from "./run.module.css";

export function RunScreen(props: { locale: AppLocale; share: string | null }) {
  const auth = useByUsAuth();
  return <Session key={auth.user?.id ?? "guest"} {...props} auth={auth} />;
}

function Session({ locale, share, auth }: { locale: AppLocale; share: string | null; auth: ReturnType<typeof useByUsAuth> }) {
  const copy = useMemo(() => getRunCopy(locale), [locale]);
  const names: Record<Character, string> = { changha: copy.changha, elina: copy.elina, yuna: copy.yuna };
  const number = new Intl.NumberFormat(locale);
  const [stage, setStage] = useState<Stage>("select");
  const [lobby, setLobby] = useState<Lobby>();
  const [publicRows, setPublicRows] = useState<Rank[]>();
  const [challenge, setChallenge] = useState<Challenge>();
  const [ticket, setTicket] = useState<Ticket>();
  const [stats, setStats] = useState<RunStats>();
  const [result, setResult] = useState<Result>();
  const [before, setBefore] = useState<{ place?: number; best: number }>({ best: 0 });
  const [submission, setSubmission] = useState<Submission>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [paying, setPaying] = useState(false);
  const [allRanks, setAllRanks] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reminded, setReminded] = useState(false);
  const [pauseRequest, setPauseRequest] = useState(0);
  const sound = useMemo(createSound, []);
  const requestKey = useRef<string | null>(null);
  const getter = useRef(auth.getAccessToken);
  getter.current = auth.getAccessToken;

  const call = useCallback(async <T,>(body: object, member = false, path = "/api/chemi/games?game=run"): Promise<T> => {
    const token = member ? await getter.current() : null;
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(String(data.error ?? response.status));
    return data;
  }, []);
  const load = useCallback(async () => {
    if (!auth.ready) return;
    setFailed(false);
    try {
      if (auth.authenticated) {
        const data = await call<Lobby>({ action: "lobby" }, true);
        setLobby(data);
        setSoundOn(data.sound);
        sound.set(data.sound);
      } else setPublicRows((await call<{ ranking: Rank[] }>({ action: "ranking" })).ranking);
      if (share) setChallenge(await call<Challenge>({ action: "challenge", shareId: share }).catch(() => undefined));
    } catch {
      setFailed(true);
    }
  }, [auth.ready, auth.authenticated, call, share, sound]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => sound.close(), [sound]);
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
  const extra = lobby?.extraRemaining ?? 0;

  async function begin(paid = false) {
    if (busy) return;
    if (!auth.authenticated && !trial) return auth.login();
    if (auth.authenticated && !lobby) return;
    setBusy(true);
    setFailed(false);
    try {
      const key = requestKey.current ??= crypto.randomUUID();
      const issued = await call<Ticket>(trial
        ? { action: "trial", key, shareId: share }
        : { action: "start", game: "run", character: "changha", key, extra: paid }, !trial);
      requestKey.current = null;
      setBefore({ place: lobby?.ranking.find((row) => row.isMe)?.place, best: lobby?.best ?? 0 });
      setLobby((now) => now && { ...now, [paid ? "extraRemaining" : "freeRemaining"]: Math.max(0, now[paid ? "extraRemaining" : "freeRemaining"] - 1), points: now.points - (paid ? 10 : 0) });
      setResult(undefined);
      setStats(undefined);
      setSubmission(undefined);
      setCopied(false);
      setPaying(false);
      setTicket({ ...issued, trial });
      setStage("run");
      if (paid && !trial) celebrateSpend({ locale, points: 10, label: copy.extraTitle });
    } catch (error) {
      if (error instanceof Error && !/^5/.test(error.message)) requestKey.current = null;
      setFailed(true);
      if (auth.authenticated) void load();
    } finally {
      setBusy(false);
    }
  }
  async function finish(body: Submission, played?: RunStats) {
    if (played) setStats(played);
    setSubmission(body);
    setStage("result");
    setBusy(true);
    setFailed(false);
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
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  function toggleSound() {
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
    const url = new URL(location.href);
    url.searchParams.set("share", result.shareId);
    try {
      if (navigator.share) await navigator.share({ title: copy.title, url: url.href });
      else { await navigator.clipboard.writeText(url.href); setCopied(true); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
    }
  }
  function again() {
    if (!auth.authenticated) return auth.login();
    if (free > 0) void begin();
    else setPaying(true);
  }

  const startLabel = !auth.ready ? copy.go : !auth.authenticated
    ? (trial ? copy.trial : copy.login)
    : free > 0 ? fill(copy.start, { name: names.changha, n: free })
      : fill(copy.extraCta, { n: extra });
  const spent = Boolean(lobby && free <= 0 && extra <= 0);
  const footer = [lobby && lobby.players > 0 ? fill(copy.players, { n: number.format(lobby.players) }) : "",
    lobby?.previous ? fill(copy.lastWeek, { n: lobby.previous.place }) : ""].filter(Boolean).join(" · ");
  const reminder = <FanAction disabled={busy || reminded} onClick={async () => {
    try { await call({ kind: "tomorrow" }, true, "/api/chemi/reminders"); setReminded(true); } catch { setFailed(true); }
  }}>{reminded ? copy.reminded : copy.remind}</FanAction>;
  const errorLine = failed && <div className={styles.error} role="alert">
    <FanText role="meta">{copy.error}</FanText>
    <FanAction size="sm" disabled={busy} onClick={() => submission ? void finish(submission) : void load()}>{copy.retry}</FanAction>
  </div>;

  if (stage === "run" && ticket) return <main className={styles.shell} lang={locale} data-stage="run">
    <Track key={ticket.playId} ticket={ticket} copy={copy} locale={locale} name={names.changha} sound={sound} soundOn={soundOn}
      onToggleSound={toggleSound} pauseRequest={pauseRequest} onFinish={(body, played) => void finish(body, played)} />
  </main>;

  return <main className={styles.shell} lang={locale} data-stage={stage}>
    <header className={styles.nav}>
      <FanIconButton aria-label={copy.back} onClick={back}><FanIcon icon={ChevronLeft} /></FanIconButton>
      <FanHeading as="h1">{copy.title}</FanHeading>
      <FanIconButton aria-label={copy.sound} aria-pressed={soundOn} onClick={toggleSound}><FanIcon icon={soundOn ? Volume2 : VolumeX} /></FanIconButton>
    </header>
    {stage === "select" && <SelectStage copy={copy} locale={locale} names={names} rows={rows} loaded={loaded} footer={footer}
      challenge={challenge} spent={spent} startLabel={startLabel} startDisabled={!auth.ready || busy || (auth.authenticated && !lobby)}
      onStart={() => auth.authenticated && free <= 0 ? setPaying(true) : void begin()} onAllRanks={() => setAllRanks(true)}
      errorLine={errorLine} reminder={reminder} />}
    {stage === "result" && <ResultStage copy={copy} locale={locale} names={names} rows={rows} loaded={loaded} stats={stats} result={result}
      before={before} saving={busy && !result} trial={Boolean(ticket?.trial)} member={auth.authenticated} spent={spent} free={free} extra={extra}
      busy={busy} copied={copied} onAgain={again} onLogin={() => auth.login()} onShare={() => void shareResult()}
      onAllRanks={() => setAllRanks(true)} errorLine={errorLine} reminder={reminder} />}
    <FanDialog open={paying} onOpenChange={setPaying} title={copy.extraTitle} closeLabel={copy.close} size="sm" responsive
      secondary={{ label: copy.cancel, onClick: () => setPaying(false) }}
      primary={{ label: copy.pay, onClick: () => void begin(true), disabled: busy || !lobby || lobby.points < 10 || extra <= 0, loading: busy }}>
      {lobby && <dl className={styles.pay}>
        <div><FanText as="dt" role="meta">{copy.pointLabel}</FanText><FanText as="dd" role="item">{number.format(lobby.points)}P → {number.format(Math.max(0, lobby.points - 10))}P</FanText></div>
        <div><FanText as="dt" role="meta">{copy.extraLabel}</FanText><FanText as="dd" role="item">{3 - extra}/3 → {Math.min(3, 4 - extra)}/3</FanText></div>
      </dl>}
      {lobby && lobby.points < 10 && <p className={styles.short}>
        <FanText role="meta">{fill(copy.short, { n: 10 - lobby.points })}</FanText>
        <FanSectionLink href={`/my/wallet?view=attendance&locale=${locale}`}>{copy.earn}</FanSectionLink>
      </p>}
    </FanDialog>
    <FanDialog open={allRanks} onOpenChange={setAllRanks} title={copy.ranking} closeLabel={copy.close} size="sm" responsive>
      <ol className={styles.allRanks}>
        {rows.map((row) => <li data-row="" key={row.place} data-me={row.isMe}>
          <FanText role="label">{row.place}</FanText>
          <FanText role="item">{rankName(row.nickname, locale)}{row.isMe && ` (${copy.me})`}</FanText>
          <FanText role="item">{number.format(row.score)}</FanText>
        </li>)}
      </ol>
    </FanDialog>
    <link rel="preload" as="image" href={ART_FILES.street} />
  </main>;
}
