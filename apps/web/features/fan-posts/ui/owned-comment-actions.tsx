"use client";
import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import styles from "./post-comments.module.css";
import { FanMenu } from "@/components/fan-ui/fan-menu";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { groupCommentCopy } from "@/features/groups/ui/group-comment-copy";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import type { AppLocale } from "@/i18n/locales";

export function OwnedCommentActions({ url, body, locale, refresh, children, renderHeader, maxLength = 1000 }: {
  children: ReactNode; renderHeader: (menu: ReactNode) => ReactNode; url: string; body: string; locale: AppLocale; refresh: () => void; maxLength?: number;
}) {
  const copy = contentCopy(locale), labels = groupCommentCopy(locale), mutation = useContentMutation(locale);
  const [draft, setDraft] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  async function submit(method: "PATCH" | "DELETE") {
    if (await mutation.request(url, method, method === "PATCH" ? { body: draft?.trim() } : undefined)) {
      setDraft(null); setRemoving(false); refresh();
    }
  }
  return <>
    {renderHeader(draft === null && <FanMenu label={labels.menu} trigger={<FanIconButton aria-label={labels.menu}><FanIcon icon={MoreHorizontal} size={20} /></FanIconButton>}>
      <FanMenu.Item onSelect={() => setDraft(body)}>{copy.edit}</FanMenu.Item>
      <FanMenu.Item destructive onSelect={() => setRemoving(true)}>{copy.delete}</FanMenu.Item>
    </FanMenu>)}
    {draft === null ? children : <form className={styles.form} onSubmit={e => { e.preventDefault(); void submit("PATCH"); }}>
      <textarea aria-label={copy.edit} autoFocus required maxLength={maxLength} value={draft} disabled={mutation.busy} onChange={e => setDraft(e.target.value)} />
      <FanAction type="button" disabled={mutation.busy} onClick={() => setDraft(null)}>{copy.cancel}</FanAction>
      <FanAction type="submit" disabled={mutation.busy || !draft.trim()}>{copy.save}</FanAction>
    </form>}
    <FanDialog open={removing} onOpenChange={setRemoving} alert size="sm" title={labels.deleteTitle} closeLabel={copy.cancel}
      primary={{ label: copy.delete, variant: "danger", loading: mutation.busy, onClick: () => void submit("DELETE") }}
      secondary={{ label: copy.cancel, onClick: () => setRemoving(false) }}>{mutation.error && <p role="alert">{mutation.error}</p>}</FanDialog>
    {!removing && mutation.error && <p role="alert">{mutation.error}</p>}
  </>;
}
