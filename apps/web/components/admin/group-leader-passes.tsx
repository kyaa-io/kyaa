"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanText } from "@/components/fan-ui/fan-text";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { leaderPassIssuedSchema, leaderPassListSchema, type LeaderPassItem } from "@/features/groups/domain/leader-pass";
import { useGroupRequest } from "@/features/groups/ui/use-group-resource";
import styles from "./group-leader-passes.module.css";

const text = {
  ko: { title: "방장 패스", label: "방 이름", make: "패스 만들기", copy: "링크 복사", copied: "복사했어요", revoke: "취소", error: "처리하지 못했습니다", empty: "만든 패스가 없습니다", open: "열린 모임", status: { active: "사용 전", used: "사용됨", expired: "만료", revoked: "취소됨" } },
  en: { title: "Leader passes", label: "Room name", make: "Create pass", copy: "Copy link", copied: "Copied", revoke: "Revoke", error: "Something went wrong", empty: "No passes yet", open: "Opened group", status: { active: "Unused", used: "Used", expired: "Expired", revoked: "Revoked" } },
} as const;
const day = (iso: string) => iso.slice(0, 10).replaceAll("-", ".");

/** 방장 패스 발급·목록. 새 링크는 만든 직후 한 번만 보이고, 서버에는 해시만 남는다. */
export function GroupLeaderPasses({ locale, readOnly }: { locale: "ko" | "en"; readOnly: boolean }) {
  const c = text[locale];
  const auth = useGroupRequest();
  const [items, setItems] = useState<LeaderPassItem[] | null>(null);
  const [label, setLabel] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const { request, authenticated, ready } = auth;

  const load = useCallback(async () => {
    try { setItems(leaderPassListSchema.parse(await request("/api/admin/group-leader-passes", {}, "json", false)).items); setFailed(false); } catch { setFailed(true); }
  }, [request]);
  useEffect(() => { if (ready && authenticated) void load(); }, [ready, authenticated, load]);

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !label.trim()) return;
    setPending(true); setFailed(false);
    try {
      const issued = leaderPassIssuedSchema.parse(await request("/api/admin/group-leader-passes", { method: "POST", body: JSON.stringify({ label: label.trim() }) }, "json", false));
      setLink(`${window.location.origin}${issued.path}`);
      setLabel("");
      await load();
    } catch { setFailed(true); } finally { setPending(false); }
  }
  async function revoke(item: LeaderPassItem) {
    try { await request(`/api/admin/group-leader-passes/${item.id}/revoke`, { method: "POST", body: "{}" }, "json", false); await load(); } catch { setFailed(true); }
  }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); showFanToast({ title: c.copied, tone: "success" }); } catch { setFailed(true); }
  }

  return <section className={styles.section} aria-labelledby="leader-passes-title">
    <FanHeading id="leader-passes-title">{c.title}</FanHeading>
    {readOnly ? null : <form className={styles.form} onSubmit={issue}>
      <input className={styles.input} name="label" aria-label={c.label} placeholder={c.label} required maxLength={100} value={label} disabled={pending} onChange={(event) => setLabel(event.target.value)} />
      <FanAction type="submit" variant="primary" disabled={pending || !label.trim()}>{c.make}</FanAction>
    </form>}
    {link ? <div className={styles.issued}>
      <input className={styles.input} readOnly aria-label={c.title} value={link} onFocus={(event) => event.currentTarget.select()} />
      <FanAction onClick={copy}>{c.copy}</FanAction>
    </div> : null}
    {failed ? <p role="alert" className={styles.error}>{c.error}</p> : null}
    {items && items.length === 0 ? <FanText role="meta" as="p">{c.empty}</FanText> : null}
    {items && items.length > 0 ? <ul className={styles.list}>
      {items.map((item) => <li key={item.id} className={styles.row}>
        <span className={styles.main}>
          <FanText role="item">{item.label}</FanText>
          <FanText role="meta">{c.status[item.status]} · {day(item.createdAt)}{item.status === "active" ? ` → ${day(item.expiresAt)}` : ""}{item.pageName && item.pageId ? <> · <a href={`/pages/groups/${item.pageId}`}>{item.pageName}</a></> : null}</FanText>
        </span>
        {item.status === "active" && !readOnly ? <FanAction variant="text" size="sm" onClick={() => revoke(item)}>{c.revoke}</FanAction> : null}
      </li>)}
    </ul> : null}
  </section>;
}
