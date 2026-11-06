"use client";
import { useState, type FormEvent, type Ref } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { EarnBadgeCorner } from "@/features/dukjil/ui/earn-badge";
import type { AppLocale } from "@/i18n/locales";
import { boardCopy } from "./board-copy";
import { groupsCopy } from "./copy";
import { useGroupPostBody, type GroupPostAssetRef } from "./group-post-body";
import { managementCopy } from "./management-copy";
import styles from "./groups.module.css";

export type GroupPostInput = { title: string; body: string; bodyDoc: unknown; visibility: string; category: string; assetIds: string[] };
type EditedPost = { title: string; body: string; bodyDoc?: unknown; visibility: string; category?: "notice" | "free"; assets?: GroupPostAssetRef[] };

export function GroupPostComposer({ locale, post, canWriteNotice, busy, formRef, onSubmit, onCancel }: { locale: AppLocale; post?: EditedPost; canWriteNotice: boolean; busy: boolean; formRef?: Ref<HTMLFormElement>; onSubmit: (input: GroupPostInput) => Promise<boolean>; onCancel: (dirty: boolean) => void }) {
  const m = managementCopy(locale), b = boardCopy(locale), t = groupsCopy(locale), [title, setTitle] = useState(post?.title ?? "");
  const body = useGroupPostBody({ locale, label: m.body, disabled: busy, initial: post && { body: post.body, bodyDoc: post.bodyDoc, assets: post.assets } });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || body.blocked || !title.trim()) return;
    const data = new FormData(event.currentTarget);
    const saved = await onSubmit({ title, ...body.submission(title), visibility: String(data.get("visibility")), category: String(data.get("category")) });
    if (saved) body.commit();
  };
  const action = <FanAction type="submit" disabled={busy || body.blocked || !title.trim()}>{post ? m.save : m.write}</FanAction>;
  return <form ref={formRef} className={`${styles.form} ${styles.boardComposer}`} onSubmit={submit}>
    <label className={styles.field}>{m.title}<input className={styles.input} name="title" required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} disabled={busy} /></label>
    <div className={styles.field}><span>{m.body}</span>{body.field}</div>
    <select name="visibility" className={styles.select} aria-label={t.membersOnly} defaultValue={post?.visibility ?? "public"} disabled={busy}><option value="public">{b.public}</option><option value="members">{b.members}</option></select>
    <select name="category" className={styles.select} aria-label={t.board} disabled={busy} defaultValue={post?.category ?? "free"}><option value="free">{b.free}</option>{canWriteNotice && <option value="notice">{b.notice}</option>}</select>
    <div className={styles.actions}><FanAction onClick={() => onCancel(body.dirty || title !== (post?.title ?? ""))}>{t.cancel}</FanAction>{post ? action : <EarnBadgeCorner action="post" locale={locale}>{action}</EarnBadgeCorner>}</div>
  </form>;
}
