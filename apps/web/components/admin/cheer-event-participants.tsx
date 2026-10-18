"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { cheerEventParticipantsSchema, type CheerEventParticipants } from "@/features/fanpage/domain/cheer-event";
import styles from "./raffle-operations-panel.module.css";

export function CheerEventParticipants({ campaignId, locale }: { campaignId: string; locale: "ko" | "en" }) {
  const { getAccessToken } = usePrivy();
  const [data, setData] = useState<CheerEventParticipants | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const ko = locale === "ko";
  async function load(offset = 0) {
    if (pending) return;
    setPending(true); setError(false);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("auth");
      const response = await fetch(`/api/admin/benefit-campaigns/${campaignId}/participants?offset=${offset}&limit=20`, { cache: "no-store", headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("request");
      const next = cheerEventParticipantsSchema.parse(await response.json());
      setData(current => offset && current ? { ...next, participants: [...current.participants, ...next.participants] } : next);
    } catch { setData(null); setError(true); }
    finally { setPending(false); }
  }
  return <section className={styles.panel} aria-label={ko ? "응원댓글 참여 내역" : "Cheer comment entries"}>
    <button type="button" disabled={pending} onClick={() => void load()}>{ko ? "응원댓글 참여 내역 조회" : "View cheer comment entries"}</button>
    {data && <>
      <p>{ko ? `참여 ${data.total}명 · 총 추첨 가중치 ${data.totalWeight}` : `${data.total} participants · total draw weight ${data.totalWeight}`}</p>
      <p>{ko ? "댓글은 계정당 한 번 참여하며, 해당 LIVE 예약자는 가중치 2로 계산됩니다." : "Each account enters once. Reservations for this LIVE have a draw weight of 2."}</p>
      <ol>{data.participants.map(row => <li key={row.appUserId}><code>{row.appUserId}</code> · <time dateTime={row.enteredAt}>{new Date(row.enteredAt).toLocaleString(locale)}</time> · {ko ? "가중치" : "Weight"} {row.weight}</li>)}</ol>
      {data.nextOffset !== null && <button type="button" disabled={pending} onClick={() => void load(data.nextOffset!)}>{ko ? "더 보기" : "Show more"}</button>}
    </>}
    {error && <p role="alert" className={styles.error}>{ko ? "참여 내역을 불러오지 못했습니다. 다시 시도해 주세요." : "Couldn’t load entries. Please try again."}</p>}
  </section>;
}
