"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { voteCopy } from "./copy";

type Snapshot = { remaining: number; startsAt: string | null; endsAt: string; ranking: { id: string; slug: string; fandom_name: string | null; votes: number }[] };
const endpoint = "/api/events/donation-vote";

export function VotePanel({ locale }: { locale: keyof typeof voteCopy }) {
  const auth = useByUsAuth();
  return <MemberPanel key={auth.user?.id ?? "guest"} locale={locale} auth={auth} />;
}

function MemberPanel({ locale, auth }: { locale: keyof typeof voteCopy; auth: ReturnType<typeof useByUsAuth> }) {
  const [title, allowance, vote, results, donation, signIn, retry, success] = voteCopy[locale];
  const [state, setState] = useState<Snapshot>();
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<{ creatorId: string; quantity: number; requestId: string } | null>(null);
  const locked = useRef(false);
  const { getAccessToken, authenticated } = auth;
  const refresh = useCallback(async () => {
    const token = await getAccessToken();
    const response = await fetch(endpoint, { headers: { Authorization: "Bearer " + token } });
    if (!response.ok) throw Error();
    setState(await response.json());
  }, [getAccessToken]);
  useEffect(() => {
    if (!authenticated) return;
    const update = () => void refresh().catch(() => setMessage(retry));
    update();
    const timer = setInterval(update, 10000);
    return () => clearInterval(timer);
  }, [refresh, authenticated, retry]);
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
  const open = state?.startsAt && Date.now() >= Date.parse(state.startsAt) && !closed;
  const days = state ? Math.max(0, Math.floor((Date.parse(state.endsAt) - 1 + 32400000) / 86400000) - Math.floor((Date.now() + 32400000) / 86400000)) : 0;
  return <>
    <FanHeading as="h1">{title}</FanHeading><p>{donation}</p>
    {!authenticated && <p>{signIn}</p>}
    {state && <>
      <FanHeading>{closed ? results : days ? "D−" + days : "D-day"}</FanHeading>
      <p>{allowance} · {state.remaining.toLocaleString(locale)} M</p>
      {open && <label>{vote} (1 M = 1) <input type="number" min={1} max={state.remaining} value={quantity || ""} onChange={e => setQuantity(Number(e.target.value))} /></label>}
      <ol>{state.ranking.map(row => <li data-row key={row.id}>{row.slug} {row.fandom_name} · <FanNumber value={row.votes} locale={locale} countUp /> {open && <FanAction size="sm" disabled={busy || !Number.isInteger(quantity) || quantity < 1 || quantity > state.remaining} onClick={() => void submit(row.id)}>{vote} · {quantity} M</FanAction>}</li>)}</ol>
    </>}
    <p role="status">{message}</p>
  </>;
}
