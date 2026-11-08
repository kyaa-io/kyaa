"use client";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { PointRewardBurst, usePointRewardBurst } from "@/components/fan-ui/point-reward-burst";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { communityShareLinkSchema } from "@/features/community-stamps/domain/community-stamps";
import { DukjilProvider, useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { missionProgress } from "@/features/dukjil/domain/dukjil-ui";
import { GroupRequestError, useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { fanLoginHref } from "@/components/login-href";
import type { AppLocale } from "@/i18n/locales";
import { checkShareProofUrl, shareProofListSchema, shareProofResultSchema } from "../domain/share-proof";
import { shareProofCopy, sharePlatformName } from "./share-proof-copy";
import gridStyles from "@/features/certification/ui/certification-grid.module.css";
import styles from "./share-proof.module.css";

const parseList = (value: unknown) => shareProofListSchema.parse(value);

/** 261107-2 D12: the share mission as a proof in the 인증 list. The tile opens the proof dialog through `share=1` in the address,
 * so the 덕질 mission row and this tile land on the same place. */
export function ShareProofTile({ slug, locale }: { slug: string; locale: AppLocale }) {
  return <DukjilProvider slug={slug} locale={locale}><ShareProofTileInner slug={slug} locale={locale} /></DukjilProvider>;
}

function ShareProofTileInner({ slug, locale }: { slug: string; locale: AppLocale }) {
  const c = shareProofCopy(locale), dukjil = useDukjil();
  const pathname = usePathname() ?? "/", params = useSearchParams(), router = useRouter();
  const open = params?.get("share") === "1";
  const withShare = (on: boolean) => { const next = new URLSearchParams(params?.toString()); if (on) next.set("share", "1"); else next.delete("share"); const query = next.toString(); return `${pathname}${query ? `?${query}` : ""}`; };
  const progress = dukjil?.status === "on" ? missionProgress(dukjil.catalog, dukjil.today, "share") : null;
  const state = progress?.count !== undefined && progress.limit ? c.today(progress.count.toLocaleString(locale), progress.limit.toLocaleString(locale)) : c.start;
  const reward = progress?.points && !progress.done ? `+${progress.points.toLocaleString(locale)}P` : "";
  return <>
    <Link href={withShare(true) as Route} scroll={false} className={gridStyles.tile} data-status="available" data-share-proof-tile="">
      <img src="/images/stamps/ink-v1/share.webp" alt="" width={32} height={32} />
      <strong>{c.title}</strong>
      <span className={gridStyles.state} data-status={progress?.done ? "approved" : "available"}>{state}{reward ? <span className={gridStyles.reward}> · {reward}</span> : null}</span>
    </Link>
    {open && <ShareProofDialog slug={slug} locale={locale} onClose={() => router.replace(withShare(false) as Route, { scroll: false })} />}
  </>;
}

export function ShareProofDialog({ slug, locale, onClose }: { slug: string; locale: AppLocale; onClose: () => void }) {
  const c = shareProofCopy(locale), fieldId = useId();
  const pathname = usePathname() ?? "/", params = useSearchParams(), router = useRouter();
  const { request, authenticated, ready } = useGroupRequest();
  const list = useGroupResource(authenticated ? `/api/me/share-proofs?creator=${encodeURIComponent(slug)}` : null, parseList);
  const [url, setUrl] = useState(""), [own, setOwn] = useState(false), [problem, setProblem] = useState(""), [ownProblem, setOwnProblem] = useState(false), [busy, setBusy] = useState(false), [linkBusy, setLinkBusy] = useState(false);
  const { burst, add, clear } = usePointRewardBurst();
  async function shareLink() {
    if (linkBusy) return;
    setLinkBusy(true);
    try {
      const { token } = communityShareLinkSchema.parse(await request("/api/community-stamps/share-link", { method: "POST", body: JSON.stringify({ creator: slug }) }));
      const link = `${window.location.origin}/s/${token}?locale=${locale}`;
      if (typeof navigator.share === "function") { try { await navigator.share({ url: link }); return; } catch (error) { if ((error as { name?: string } | null)?.name === "AbortError") return; } }
      await navigator.clipboard.writeText(link);
      showFanToast({ title: c.copied, tone: "success" });
    } catch { showFanToast({ title: c.linkFailed, tone: "error", action: { label: c.shareLink, onClick: () => void shareLink() } }); }
    finally { setLinkBusy(false); }
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    const checked = checkShareProofUrl(url);
    if (!checked.ok) { setProblem(checked.problem === "short" ? c.short : checked.problem === "not_post" ? c.notPost : c.invalid); return; }
    if (!own) { setOwnProblem(true); return; }
    setBusy(true); setProblem(""); setOwnProblem(false);
    try {
      const result = shareProofResultSchema.parse(await request("/api/me/share-proofs", { method: "POST", body: JSON.stringify({ creator: slug, url: url.trim(), ownPost: true }) }));
      setUrl(""); setOwn(false);
      if (result.reward?.points) add(result.reward.points);
      else if (result.reward?.skippedReason === "daily_limit") showFanToast({ title: c.dailyLimit, tone: "neutral" });
      else if (result.replayed) showFanToast({ title: c.used, tone: "neutral" });
    } catch (error) {
      const code = error instanceof GroupRequestError ? error.code : "";
      if (code === "SHARE_PROOF_OWN_POST_REQUIRED") { setOwnProblem(true); return; }
      setProblem(code === "SHARE_PROOF_URL_SHORT" ? c.short : code === "SHARE_PROOF_URL_NOT_POST" ? c.notPost : code === "SHARE_PROOF_URL_UNSUPPORTED" || code === "INVALID_REQUEST" ? c.invalid : code === "PASSPORT_REQUIRED" ? c.passport : c.failed);
    } finally { setBusy(false); }
  }
  const returnTo = `${pathname}?${params?.toString() ?? ""}`;
  return <FanDialog open onOpenChange={value => { if (!value) onClose(); }} responsive size="md" title={c.title} closeLabel={c.close}
    primary={!ready ? undefined : authenticated ? { label: c.submit, onClick: () => void submit(), loading: busy } : { label: c.login, onClick: () => router.push(fanLoginHref(locale, returnTo) as Route) }} secondary={{ label: c.close, onClick: onClose }}>
    <PointRewardBurst locale={locale} points={burst?.points ?? 0} burstKey={burst?.key} onDone={clear} />
    <div className={styles.body} data-share-proof="">
      <section className={styles.step}>
        <p className={styles.stepTitle}>{c.step1}</p>
        <FanAction variant="secondary" size="sm" onClick={() => void shareLink()} loading={linkBusy} disabled={!authenticated}>{c.shareLink}</FanAction>
      </section>
      <form className={styles.step} onSubmit={event => void submit(event)} noValidate>
        <label className={styles.stepTitle} htmlFor={fieldId}>{c.step2}</label>
        <input id={fieldId} className={styles.input} type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://" value={url}
          onChange={event => { setUrl(event.target.value); if (problem) setProblem(""); }} aria-invalid={Boolean(problem) || undefined} aria-describedby={problem ? `${fieldId}-error` : undefined} disabled={!authenticated || busy} maxLength={600} />
        {problem && <p id={`${fieldId}-error`} className={styles.error} role="alert">{problem}</p>}
        <label className={styles.check}>
          <input type="checkbox" checked={own} onChange={event => { setOwn(event.target.checked); if (event.target.checked) setOwnProblem(false); }} disabled={!authenticated || busy} required aria-invalid={ownProblem || undefined} aria-describedby={ownProblem ? `${fieldId}-own-error` : undefined} />
          <span>{c.own}</span>
        </label>
        {ownProblem && <p id={`${fieldId}-own-error`} className={styles.error} role="alert">{c.ownRequired}</p>}
      </form>
      {ready && !authenticated ? null : <section className={styles.step} aria-labelledby={`${fieldId}-mine`}>
        <p id={`${fieldId}-mine`} className={styles.stepTitle}>{c.mine}</p>
        {list.loading ? <FanSkeletonRows rows={2} variant="plain" /> : list.data?.items.length ? <ul className={styles.list}>{list.data.items.slice(0, 5).map(item => <li key={item.id}>
          <a href={item.url} target="_blank" rel="noopener noreferrer" data-outbound-tracking="off">{sharePlatformName(locale, item.platform)}</a>
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(locale, { month: "2-digit", day: "2-digit" })}</time>
          <span data-status={item.status}>{item.status === "revoked" ? c.revoked : item.points ? `+${item.points.toLocaleString(locale)}P` : c.noPoints}</span>
        </li>)}</ul> : <p className={styles.muted}>{c.none}</p>}
      </section>}
    </div>
  </FanDialog>;
}

/** The fan's share proofs as rows of the 인증 history (same row look as the certification submissions, passed in by the panel).
 * `empty` is drawn only when neither list has a row. */
export function ShareProofHistoryRows({ slug, locale, classes, empty }: { slug: string; locale: AppLocale; classes: { row: string; copy: string; status: string }; empty: ReactNode }) {
  const c = shareProofCopy(locale), pathname = usePathname() ?? "/", params = useSearchParams();
  const { authenticated } = useGroupRequest();
  const list = useGroupResource(authenticated ? `/api/me/share-proofs?creator=${encodeURIComponent(slug)}` : null, parseList);
  const items = list.data?.items ?? [];
  if (!items.length) return <>{list.loading ? null : empty}</>;
  const next = new URLSearchParams(params?.toString()); next.set("share", "1");
  return <>{items.map(item => <Link key={item.id} href={`${pathname}?${next.toString()}` as Route} scroll={false} className={classes.row} data-share-proof-row="">
    <span className={classes.copy}><strong>{c.title}</strong><small>{sharePlatformName(locale, item.platform)}</small><small>{new Intl.DateTimeFormat(locale, { calendar: "gregory", dateStyle: "medium" }).format(new Date(item.createdAt))}</small></span>
    <span className={classes.status} data-status={item.status === "revoked" ? "rejected" : "approved"}>{item.status === "revoked" ? c.revoked : item.points ? `+${item.points.toLocaleString(locale)}P` : c.noPoints}</span>
  </Link>)}</>;
}
