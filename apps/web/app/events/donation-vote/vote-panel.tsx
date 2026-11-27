"use client";

import { formatMileage } from "@/i18n/format-mileage";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { fanLoginHref } from "@/components/login-href";
import styles from "./vote-panel.module.css";
import { voteCopy } from "./copy";

type Snapshot = { remaining?: number; startsAt: string | null; endsAt: string; ranking: { id: string; slug: string; fandom_name: string | null; votes: number }[] };
const endpoint = "/api/events/donation-vote";

type PanelProps = {
  locale: keyof typeof voteCopy;
  profiles: Record<string, { name: string; image?: PublishedCelebrity["image"] }>;
};

export function VotePanel(props: PanelProps) {
  const auth = useByUsAuth();
  return <MemberPanel key={auth.user?.id ?? "guest"} {...props} auth={auth} />;
}

function MemberPanel({ locale, profiles, auth }: PanelProps & { auth: ReturnType<typeof useByUsAuth> }) {
  const [title, allowance, vote, results, donation, signIn, retry, success] = voteCopy[locale];
  const [state, setState] = useState<Snapshot>();
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<{ creatorId: string; quantity: number; requestId: string } | null>(null);
  const locked = useRef(false);
  const { getAccessToken, authenticated, ready } = auth;
  const loginHref = fanLoginHref(locale, `/events/donation-vote?locale=${locale}`);
  const guest = ready && !authenticated;
  const refresh = useCallback(async () => {
    const token = authenticated ? await getAccessToken() : null;
    if (authenticated && !token) throw Error();
    const response = await fetch(endpoint, token ? { headers: { Authorization: "Bearer " + token } } : undefined);
    if (!response.ok) throw Error();
    setState(await response.json());
  }, [authenticated, getAccessToken]);
  useEffect(() => {
    if (!ready) return;
    const update = () => void refresh().catch(() => setMessage(retry));
    update();
    const timer = setInterval(update, 10000);
    return () => clearInterval(timer);
  }, [refresh, ready, retry]);
  async function submit(creatorId: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    if (!pending.current || pending.current.creatorId !== creatorId || pending.current.quantity !== quantity) {
      pending.current = { creatorId, quantity, requestId: crypto.randomUUID() };
    }
    try {
      const token = await getAccessToken();
      const response = await fetch(endpoint, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(pending.current) });
      if (!response.ok) throw Error();
      pending.current = null;
      setMessage(success);
      await refresh();
    } catch { setMessage(retry); }
    finally { locked.current = false; setBusy(false); }
  }
  const closed = state && Date.now() >= Date.parse(state.endsAt);
  const open = Boolean(state?.startsAt && Date.now() >= Date.parse(state.startsAt) && !closed);
  const days = state ? Math.max(0, Math.floor((Date.parse(state.endsAt) - 1 + 32400000) / 86400000) - Math.floor((Date.now() + 32400000) / 86400000)) : 0;
  const remaining = state?.remaining ?? 0;
  return <section className={guest && !closed ? `${styles.panel} ${styles.guest}` : styles.panel}>
    <FanHeading as="h1">{title}</FanHeading><p>{donation}</p>
    {state && <>
      <FanHeading>{closed ? results : days ? "D−" + days : "D-day"}</FanHeading>
      {authenticated && <p>{allowance} · {formatMileage(remaining, locale)}</p>}
      {authenticated && open && <label>{vote} ({formatMileage(1, locale)} = 1) <input type="number" min={1} max={remaining} value={quantity || ""} onChange={e => setQuantity(Number(e.target.value))} /></label>}
      <ol className={styles.ranking} role="list">{state.ranking.map((row, index, ranking) => {
        const profile = profiles[row.slug];
        const ranked = row.votes > 0 && row.votes !== ranking[index - 1]?.votes && row.votes !== ranking[index + 1]?.votes;
        return (
          <li data-row key={row.id}>
            <div className={styles.row}>
              <div className={styles.identity}>
                {ranked && <span className={styles.rank}>{new Intl.NumberFormat(locale).format(index + 1)}.</span>}
                <CreatorAvatar slug={row.slug} src={profile?.image?.url} photos={profile?.image?.photos} position={profile?.image?.position} size={32} />
                <span>{profile?.name ?? row.slug}{row.fandom_name && <> · {row.fandom_name}</>}</span>
              </div>
              <FanNumber value={row.votes} locale={locale} countUp />
              {guest && !closed
                ? <FanAction size="sm" href={loginHref}>{vote}</FanAction>
                : open && <FanAction size="sm" disabled={busy || !Number.isInteger(quantity) || quantity < 1 || quantity > remaining} onClick={() => void submit(row.id)}>{vote} · {formatMileage(quantity, locale)}</FanAction>}
            </div>
          </li>
        );
      })}</ol>
    </>}
    <p role="status">{message}</p>
    {guest && !closed && <div className={styles.loginBar}>
      <FanAction href={loginHref} variant="primary" fullWidth>{signIn}</FanAction>
    </div>}
  </section>;
}
