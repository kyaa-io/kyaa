"use client";

import type { AppLocale } from "@/i18n/locales";
import { copyFor } from "./shared-passport-copy";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { ArrowRight, Heart } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { bypassImageOptimization } from "@/components/fan-ui/public-image-policy";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";

import { communityStampAsset, communityShareDestinationSchema, type SharedPassportActivity } from "../domain/community-stamps";
import { personalCopy } from "@/i18n/catalogs/features__my__ui__personal-copy";
import { fanProfileText } from "@/features/fan-profile/fan-profile-copy";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import { communityStampAction } from "./use-community-stamps";
import styles from "./share-passport.module.css";

type Locale = AppLocale;
type Creator = { slug: string; name: string; image: { url: string; alt: string } };

export function SharedPassportLanding({ token, creator, locale, activity }: { token: string; creator: Creator; locale: Locale; activity?: SharedPassportActivity }) {
  const auth = usePrivy();
  return <SharedPassportLandingInner key={`${auth.user?.id ?? "guest"}:${token}:${creator.slug}:${locale}`} token={token} creator={creator} locale={locale} activity={activity} authenticated={auth.authenticated} ready={auth.ready} getAccessToken={auth.getAccessToken} />;
}

function SharedPassportLandingInner({ token, creator, locale, activity, authenticated, ready, getAccessToken }: { token: string; creator: Creator; locale: Locale; activity?: SharedPassportActivity; authenticated: boolean; ready: boolean; getAccessToken: () => Promise<string | null> }) {
  const c = copyFor(locale);
  const t = personalCopy[locale];
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const alive = useRef(true);
  const creatorHref = `${creatorHomeHref(creator.slug)}?locale=${locale}`;
  const loginHref = `/login?locale=${locale}&returnTo=${encodeURIComponent(`/s/${token}?locale=${locale}`)}`;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function visit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      const result = await communityStampAction(getAccessToken, "share-visit", { token }, (value) => communityShareDestinationSchema.parse(value));
      if (alive.current) router.push(`${creatorHomeHref(result.creator)}?locale=${locale}` as Route);
    } catch {
      inFlight.current = false;
      if (alive.current) { setBusy(false); setError(c.failed); }
    }
  }

  return <main className={styles.landing}>
    <section className={styles.landingCard} aria-labelledby="shared-passport-title">
      <div className={styles.eyebrow}><Heart aria-hidden="true" />{c.eyebrow}</div>
      <div className={styles.creatorPortrait}><Image src={creator.image.url} alt={creator.image.alt} width={112} height={112} sizes="112px" unoptimized={bypassImageOptimization(creator.image.url)} /></div>
      <p className={styles.creatorName}>{creator.name}</p>
      <h1 id="shared-passport-title">{c.title}</h1>
      {activity ? <section className={styles.activityCard} aria-label={locale === "ko" ? "팬 패스포트" : "Fan Passport"}>
        <FanTierBadge tier={activity.tier} locale={locale} size={64} adjacentLabel={false}/>
        <dl><div><dt>{t.issued}</dt><dd><time dateTime={activity.issuedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(activity.issuedAt))}</time></dd></div>
          <div><dt>{t.score}</dt><dd>{activity.score.toLocaleString(locale)}</dd></div>
          <div><dt>{t.activities}</dt><dd>{activity.activityCount.toLocaleString(locale)}</dd></div>
          {activity.stampCount === null ? null : <div><dt>{fanProfileText(locale, "profStamps")}</dt><dd>{activity.stampCount.toLocaleString(locale)}</dd></div>}</dl>
      </section> : null}
      <Image className={styles.shareArtwork} unoptimized src={communityStampAsset("share")} alt="" width={512} height={512} />
      {ready && authenticated ? <button type="button" className={styles.primary} disabled={busy} onClick={() => void visit()}>{busy ? c.signing : c.signedIn}<ArrowRight aria-hidden="true" /></button> : ready ? <Link className={styles.primary} href={loginHref as Route}>{c.signIn}<ArrowRight aria-hidden="true" /></Link> : null}
      {/* 261107-2 D12: opening a share link no longer records a share stamp for its sender, so the line saying so is gone. */}
      <Link className={styles.secondary} href={creatorHref as Route}>{c.ordinary}</Link>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  </main>;
}
