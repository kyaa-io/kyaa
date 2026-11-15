"use client";

import type { Route } from "next";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { useState } from "react";

import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { BadgeCheck, CreditCard, HandCoins, HeartHandshake, Receipt, Share2, ShoppingBag, Ticket } from "@/components/fan-ui/fan-icons";
import { FanLockedRows } from "@/components/fan-ui/fan-locked-value";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanSurface } from "@/components/fan-ui/fan-surface";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanText } from "@/components/fan-ui/fan-text";
import { MediaFill } from "@/components/fan-ui/media-fill";
import { RollingNumber } from "@/components/fan-ui/rolling-number";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { ContentActions } from "@/features/content-safety/ui/content-actions";
import { DukjilProvider, useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { EarnBadge, POINT_COIN_SRC } from "@/features/dukjil/ui/earn-badge";
import { SNS_POST_PROOF, SUBMITTABLE_PROOF_TYPES, type MyProofItem, type ProofBoardItem, type ProofSummary, type ProofType } from "@/features/passport/domain/proof-types";
import type { AppLocale } from "@/i18n/locales";
import { listMyProofs, listProofBoard, readProofSummary, ProofRequestError } from "./proof-api";
import { proofsText, type ProofsCopyKey } from "./proofs-copy";
import { JjinfanTitle, PROOF_STATUS_KEY, PROOF_TYPE_KEY, useProofResource } from "./proofs-screen";
import styles from "./proofs-tab.module.css";

const TYPE_ICON: Record<ProofType, typeof Receipt> = {
  membership: BadgeCheck, purchase: ShoppingBag, receipt: Receipt, ticket: Ticket,
  donation: HeartHandshake, funding: HandCoins, kyaa_payment: CreditCard, sns_post: Share2,
};
const MY_ROWS = 5;

const submitHref = (slug: string, locale: AppLocale, type?: ProofType) => `/c/${slug}/proofs?locale=${locale}${type ? `&type=${type}` : ""}`;
// 2026.11.08 (DESIGN 1절: 거래·공지 날짜), in KST like the monthly count.
const day = (iso: string) => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const kst = new Date(at.getTime() + 9 * 3600_000);
  return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}`;
};

/** Reward, counts and the one action. The counts are page totals with no member behind them; a zero is not drawn. */
export function ProofReward({ locale, slug, points, summary }: { locale: AppLocale; slug: string; points?: number; summary: ProofSummary | null }) {
  const stats: [ProofsCopyKey, number][] = summary ? [["pfStatTotal", summary.approvedCount], ["pfStatMonth", summary.monthFanCount]] : [];
  const shown = stats.filter(([, value]) => value > 0);
  return (
    <div className={styles.reward} data-block="proof-reward">
      {typeof points === "number" ? (
        <FanNumber value={points} unit="P" locale={locale} size="xl" icon={<span className={styles.rewardIcon}><img src={POINT_COIN_SRC} width={40} height={40} alt="" /><span className={styles.rewardPlus}>+</span></span>} />
      ) : null}
      {shown.length ? (
        <dl className={styles.stats}>
          {shown.map(([key, value]) => (
            <div key={key} className={styles.stat}>
              <FanText role="meta" as="dt">{proofsText(locale, key)}</FanText>
              <FanText role="item" as="dd" className={styles.statValue}><RollingNumber value={value} initialFromZero /></FanText>
            </div>
          ))}
        </dl>
      ) : null}
      <FanAction className={styles.rewardAction} href={submitHref(slug, locale)} variant="primary">{proofsText(locale, "pfTabSubmit")}</FanAction>
    </div>
  );
}

/** The proof kinds open now. Each row opens the submit screen on that kind and shows what its approval pays. */
export function ProofMethods({ locale, slug, types, pointsOf }: { locale: AppLocale; slug: string; types: ProofType[]; pointsOf: (type: ProofType) => number | undefined }) {
  const ordered = SUBMITTABLE_PROOF_TYPES.filter((type) => types.includes(type));
  return (
    <FanSurface appearance="list">
      <ul>
        {ordered.map((type) => {
          const points = pointsOf(type);
          return (
            <li key={type} data-row="">
              <Link className={styles.method} href={submitHref(slug, locale, type) as Route} data-proof-method={type}>
                <FanIcon icon={TYPE_ICON[type]} size={20} />
                <FanText role="item" className={styles.methodName}>{proofsText(locale, PROOF_TYPE_KEY[type])}</FanText>
                {typeof points === "number" && points > 0 ? <EarnBadge variant="inline" locale={locale} points={points} slot /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </FanSurface>
  );
}

const STATUS_TONE: Record<MyProofItem["status"], "fan" | "neutral" | "notice"> = {
  approved: "fan", pending: "neutral", in_review: "neutral", changes_requested: "notice", rejected: "notice",
};

/** The viewer's own submissions for this page: kind, day, state, and the reviewer's reason when one was given. */
export function MyProofRows({ locale, slug, items }: { locale: AppLocale; slug: string; items: MyProofItem[] }) {
  return (
    <FanSurface appearance="list">
      <ul>
        {items.slice(0, MY_ROWS).map((item) => (
          <li key={item.submissionId} className={styles.mine} data-row="" data-proof-status={item.status}>
            <div className={styles.mineHead}>
              <FanText role="item" className={styles.methodName}>{proofsText(locale, PROOF_TYPE_KEY[item.proofType])}</FanText>
              <FanText role="meta" as="time" dateTime={item.submittedAt}>{day(item.submittedAt)}</FanText>
              <FanTag tone={STATUS_TONE[item.status]} className={styles.mineTag}>{proofsText(locale, PROOF_STATUS_KEY[item.status])}</FanTag>
            </div>
            {item.reason || item.status === "changes_requested" ? (
              <div className={styles.mineNote}>
                {item.reason ? <FanText role="meta" as="p" className={styles.reason}><span>{proofsText(locale, "pfReason")}</span> {item.reason}</FanText> : null}
                {item.status === "changes_requested" ? <FanAction variant="text" size="sm" href={submitHref(slug, locale, item.proofType)}>{proofsText(locale, "pfResubmit")}</FanAction> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </FanSurface>
  );
}

/** Consented, approved captures only. The picture is shown whole; a tap opens it at full size. */
export function ProofPhotoFeed({ locale, items, onChanged }: { locale: AppLocale; items: ProofBoardItem[]; onChanged?: () => void }) {
  // After a block succeeds the tile goes away at once (by post id, no author id); the re-fetch then drops the author's other posts.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const shown = items.filter((item) => item.imageUrl && !hidden.has(item.postId));
  if (!shown.length) return <FanState kind="empty" title={proofsText(locale, "pfBoardEmpty")} />;
  return (
    <ul className={styles.feed}>
      {shown.map((item) => (
        <li key={item.postId} className={styles.tile} data-row="">
          <Link className={styles.frameLink} href={item.imageUrl as Route} prefetch={false} target="_blank" rel="noreferrer" aria-label={proofsText(locale, PROOF_TYPE_KEY[item.proofType])}>
            <MediaFill src={item.imageUrl} className={styles.frame}>
              {/* eslint-disable-next-line @next/next/no-img-element -- API-streamed masked proof image */}
              <img className={styles.photo} src={item.imageUrl!} alt="" loading="lazy" decoding="async" />
            </MediaFill>
          </Link>
          <div className={styles.tileMeta}>
            <FanText role="label" className={styles.methodName}>{proofsText(locale, PROOF_TYPE_KEY[item.proofType])}</FanText>
            {item.awardedPoints != null ? <EarnBadge variant="inline" locale={locale} points={item.awardedPoints} /> : null}
            <ContentActions targetType="fan_post" targetId={item.postId} locale={locale} onChanged={() => { setHidden((current) => new Set(current).add(item.postId)); onChanged?.(); }} />
          </div>
          {item.jjinfanRank ? <JjinfanTitle locale={locale} rank={item.jjinfanRank} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function PublicProofsTab({ locale, slug }: { locale: AppLocale; slug: string }) {
  return <DukjilProvider slug={slug} locale={locale}><ProofsTab locale={locale} slug={slug} /></DukjilProvider>;
}

function ProofsTab({ locale, slug }: { locale: AppLocale; slug: string }) {
  const dukjil = useDukjil();
  const rules = dukjil?.status === "on" ? dukjil.catalog?.rules : undefined;
  // An SNS post is paid as the subscription action (slot 07); every other kind is the proof action (slot 09).
  const pointsOf = (type: ProofType) => rules?.[type === SNS_POST_PROOF ? "subscription" : "proof"]?.points;
  const auth = useByUsAuth();
  const signedIn = auth.ready && auth.authenticated;
  const summary = useProofResource(() => readProofSummary(slug), [slug]);
  const board = useProofResource(async () => {
    const token = signedIn ? await auth.getAccessToken().catch(() => null) : null;
    return listProofBoard(slug, undefined, token);
  }, [slug, auth.ready, auth.authenticated]);
  const mine = useProofResource(
    () => (!auth.ready ? new Promise<never>(() => {}) : signedIn ? listMyProofs(() => auth.getAccessToken(), slug) : Promise.reject(new ProofRequestError("auth", 401))),
    [slug, auth.ready, auth.authenticated],
  );
  const types = summary.state.status === "ready" ? summary.state.data.proofTypes : [];
  const methodsPending = summary.state.status === "loading";
  return (
    <section data-block="proof-feed" className={styles.tab}>
      <ProofReward locale={locale} slug={slug} points={pointsOf("receipt")} summary={summary.state.status === "ready" ? summary.state.data : null} />
      <div className={styles.pair} data-single={!methodsPending && !types.length ? "" : undefined}>
        {methodsPending || types.length ? (
          <div className={styles.block}>
            <FanSectionHeader title={proofsText(locale, "pfMethods")} />
            {methodsPending ? <FanSkeletonRows rows={3} /> : <ProofMethods locale={locale} slug={slug} types={types} pointsOf={pointsOf} />}
          </div>
        ) : null}
        <div className={styles.block}>
          <FanSectionHeader title={proofsText(locale, "pfMine")} />
          {mine.state.status === "loading" ? <FanSkeletonRows rows={2} /> : null}
          {mine.state.status === "error" && mine.state.auth ? <FanLockedRows rows={2} /> : null}
          {mine.state.status === "error" && !mine.state.auth ? <FanState kind="error" inline compact title={proofsText(locale, "pfError")} actions={<FanAction variant="text" onClick={mine.retry}>{proofsText(locale, "pfRetry")}</FanAction>} /> : null}
          {mine.state.status === "ready" && mine.state.data.length ? <MyProofRows locale={locale} slug={slug} items={mine.state.data} /> : null}
          {mine.state.status === "ready" && !mine.state.data.length ? <FanState kind="empty" title={proofsText(locale, "pfEmpty")} /> : null}
        </div>
      </div>
      <div className={styles.block}>
        <FanSectionHeader title={proofsText(locale, "pfBoard")} />
        {board.state.status === "loading" ? <FanSkeletonRows rows={4} variant="tile" className={styles.feed} /> : null}
        {board.state.status === "error" ? <FanState kind="error" inline compact title={proofsText(locale, "pfError")} actions={<FanAction variant="text" onClick={board.retry}>{proofsText(locale, "pfRetry")}</FanAction>} /> : null}
        {board.state.status === "ready" ? <ProofPhotoFeed locale={locale} items={board.state.data.items} onChanged={board.retry} /> : null}
      </div>
    </section>
  );
}
