"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUp, Check, Ticket, X } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { RaffleResultReveal } from "@/features/benefit/ui/raffle-result-reveal";
import { waveDrawCopy } from "@/i18n/catalogs/features__fanpage__wave-draw";
import { waveProgramsCopy } from "@/i18n/catalogs/features__fanpage__wave-programs";
import type { AppLocale } from "@/i18n/locales";
import { WAVE_PRIZES, waveDrawResponseSchema, type WaveDrawResponse, type WavePrizeKey } from "../domain/wave-draw";
import { useFanpageResource } from "./use-fanpage-resource";
import styles from "./wave-draw.module.css";

const parse = (value: unknown) => waveDrawResponseSchema.parse(value);
export const wavePrizeImage = (key: WavePrizeKey) => `/images/wave/prizes/${key}.webp`;
const prizeFor = (key: WavePrizeKey) => WAVE_PRIZES.find(prize => prize.key === key)!;

export function WaveDraw({ locale }: { locale: AppLocale }) {
  const session = useByUsSession(), auth = usePrivy();
  return <Draw key={`${session.ownerId ?? auth.user?.id}:${session.generation}`} locale={locale} owner={session.ownerId ?? auth.user?.id ?? ""} />;
}
function Draw({ locale, owner }: { locale: AppLocale; owner: string }) {
  const resource = useFanpageResource("/api/kyaa-wave/draw", parse, true), copy = waveDrawCopy(locale), common = waveProgramsCopy(locale), heading = useId();
  const { retry } = resource;
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) retry(); }, 5000);
    return () => window.clearInterval(timer);
  }, [retry]);
  if (resource.state.status === "loading") return <p role="status">{common.loading}</p>;
  if (resource.state.status === "error") return <p role="alert">{common.error} <FanAction onClick={resource.retry}>{common.retry}</FanAction></p>;
  const data = resource.state.data;
  const prize = data.result.status === "won" ? prizeFor(data.result.prizeKey) : null;
  return <section className={styles.section}>
    <FanSectionHeader title={copy.title} description={data.draw ? copy.closed : copy.intro} />
    <div className={styles.ticket}><Ticket aria-hidden="true" size={24} /><span>{copy.tickets}</span><strong>{data.tickets}</strong></div>
    {resource.refreshFailed && <p role="alert">{common.error} <FanAction variant="text" onClick={resource.retry}>{common.retry}</FanAction></p>}
    {!data.draw ? <EntryPicker key={data.entry?.updatedAt ?? "new"} locale={locale} entry={data.entry} tickets={data.tickets} onSaved={resource.retry} />
      : data.result.status === "won" || data.result.status === "not_won" ? <RaffleResultReveal locale={locale} storageKey={owner ? `wave-draw:${data.draw.id}:${owner}` : null} outcome={data.result.status === "won" ? "won" : "not_won"} title={prize?.title ?? copy.notWon} imageUrl={prize ? wavePrizeImage(prize.key) : null} headingId={heading} announcement={prize ? `${copy.won} ${prize.title}` : copy.notWon}>
          <h2 id={heading}>{prize ? copy.won : copy.notWon}</h2>{prize && <p>{prize.title}</p>}
        </RaffleResultReveal>
        : <p className={styles.waiting} role="status">{data.result.status === "not_entered" ? copy.notEntered : data.draw.revealedThrough ? copy.pending : copy.waiting}</p>}
    {data.published.length > 0 && <section className={styles.results} aria-label={copy.results}><FanSectionHeader title={copy.results} />
      {data.published.map(result => <div key={result.prizeKey} className={styles.published}>
        <img src={wavePrizeImage(result.prizeKey)} width={96} height={96} alt="" /><div><h3>{prizeFor(result.prizeKey).title}</h3><WaveWinners winners={result.winners} locale={locale} /></div>
      </div>)}
    </section>}
  </section>;
}
export function WaveWinners({ winners, locale }: { winners: WaveDrawResponse["published"][number]["winners"]; locale: AppLocale }) {
  return winners.length ? <ul className={styles.winners}>{winners.map((winner, index) => <li key={index}><img src={winner.avatarUrl} width={32} height={32} alt="" /><span>{winner.nickname}</span></li>)}</ul> : <p>{waveDrawCopy(locale).noWinners}</p>;
}
function EntryPicker({ locale, entry, tickets, onSaved }: { locale: AppLocale; entry: WaveDrawResponse["entry"]; tickets: number; onSaved: () => void }) {
  const copy = waveDrawCopy(locale), common = waveProgramsCopy(locale), mutation = useContentMutation(locale);
  const [selected, setSelected] = useState<WavePrizeKey[]>(entry?.preferences ?? []), [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState(JSON.stringify(entry?.preferences ?? []));
  const attempt = useRef({ payload: "", requestId: "" }), busy = useRef(false);
  const changed = baseline !== JSON.stringify(selected);
  function choose(key: WavePrizeKey) {
    setSaved(false);
    setSelected(current => current.includes(key) ? current.filter(value => value !== key) : current.length < 3 ? [...current, key] : current);
  }
  function earlier(index: number) {
    setSaved(false);
    setSelected(current => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; });
  }
  async function save() {
    if (busy.current || selected.length !== 3 || !changed || tickets < 1) return;
    const payload = JSON.stringify(selected);
    if (attempt.current.payload !== payload) attempt.current = { payload, requestId: crypto.randomUUID() };
    busy.current = true;
    try {
      const result = await mutation.request("/api/kyaa-wave/draw", "PUT", { preferences: selected, requestId: attempt.current.requestId });
      if (result) { setBaseline(payload); setSaved(true); onSaved(); }
    } finally { busy.current = false; }
  }
  return <div className={styles.picker}>
    <div className={styles.selection}><h3>{copy.selection} <span>{selected.length}/3</span></h3>
      <ol>{selected.map((key, index) => <li key={key}><span className={styles.order}>{index + 1}</span><strong>{prizeFor(key).title}</strong><div className={styles.orderActions}>
        {index > 0 && <button type="button" disabled={mutation.busy} onClick={() => earlier(index)} aria-label={`${prizeFor(key).title} · ${copy.earlier}`}><ArrowUp size={18} /></button>}
        <button type="button" disabled={mutation.busy} onClick={() => choose(key)} aria-label={`${prizeFor(key).title} · ${copy.remove}`}><X size={18} /></button>
      </div></li>)}</ol>
      <FanAction variant="primary" fullWidth disabled={mutation.busy || selected.length !== 3 || !changed || tickets < 1} ariaBusy={mutation.busy} onClick={() => void save()}>{mutation.busy ? common.loading : entry ? copy.change : copy.save}</FanAction>
      {(saved || entry && !changed) && <p role="status" className={styles.saved}><Check size={18} aria-hidden="true" />{copy.saved}</p>}
      {mutation.error && <p role="alert">{mutation.error}</p>}
    </div>
    <div className={styles.grid}>{WAVE_PRIZES.map(prize => {
      const rank = selected.indexOf(prize.key);
      return <button key={prize.key} type="button" className={styles.prize} aria-pressed={rank >= 0} disabled={mutation.busy || rank < 0 && selected.length === 3} onClick={() => choose(prize.key)}>
        <div className={styles.artwork}><img src={wavePrizeImage(prize.key)} width={640} height={640} alt="" loading="lazy" />{rank >= 0 && <span className={styles.rank}>{rank + 1}</span>}</div>
        <strong>{prize.title}</strong><span className={styles.quantity}>{copy.quantity.replace("{n}", String(prize.quantity))}</span>
      </button>;
    })}</div>
    <p className={styles.source} lang="ko">일러스트는 참고용입니다. 일부 상품은 디자인·모델 확인 전 예시이며 실제 경품과 다를 수 있습니다.</p>
    <p className={styles.rules}>{copy.rules}</p>
  </div>;
}
