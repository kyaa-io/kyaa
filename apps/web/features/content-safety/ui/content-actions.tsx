"use client";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { Ellipsis } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanMenu } from "@/components/fan-ui/fan-menu";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { rememberOverlayTrigger } from "@/components/ui/overlay/focus-return";
import { type TargetType } from "@/features/fan-posts/domain/content";
import { type AppLocale } from "@/i18n/locales";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { TranslationControl, useAutomaticTranslation } from "./use-automatic-translation";
import { useContentMutation } from "./use-content-mutation";
import { useByUsSession } from "@/components/byus-session-provider";
import styles from "./content.module.css";

type ContentActionsProps = {
  targetType: TargetType; targetId: string; locale: AppLocale; onChanged?: () => void; canBlock?: boolean; directReport?:boolean;
};
export function ContentActions(props: ContentActionsProps) {
  const auth = usePrivy(), session = useByUsSession();
  return <ActionsForOwner key={`${props.targetType}:${props.targetId}:${auth.authenticated}:${session.ownerId ?? auth.user?.id}:${session.generation}`} {...props} />;
}
function ActionsForOwner({ targetType, targetId, locale, onChanged, canBlock = true,directReport=false }: ContentActionsProps) {
  const auth = usePrivy(), copy = contentCopy(locale), mutation = useContentMutation(locale), fieldId = useId();
  const [reason, setReason] = useState(""), [message, setMessage] = useState(""), [reportOpen, setReportOpen] = useState(false);
  const attempt = useRef<{ reason: string; key: string } | null>(null), trigger = useRef<HTMLButtonElement | null>(null), reasonField = useRef<HTMLTextAreaElement | null>(null);
  if (!auth.ready || !auth.authenticated) return null;
  async function report() {
    const text = reason.trim();
    if (!text) return;
    if (attempt.current?.reason !== text) attempt.current = { reason: text, key: crypto.randomUUID() };
    const result = await mutation.request("/api/content-reports", "POST", { targetType, targetId, reason: text, idempotencyKey: attempt.current.key });
    if (result) { setReason(""); setReportOpen(false); setMessage(copy.reportSent); attempt.current = null; }
  }
  async function block() {
    if (!window.confirm(copy.blockConfirm)) return;
    if (await mutation.request("/api/content-blocks", "POST", { targetType, targetId })) {
      setMessage(copy.blocked); notifyFanActivityUpdated(auth.user?.id); onChanged?.();
    }
  }
  return <div className={styles.contentActions}>
    {directReport?<button ref={trigger} type="button" className={styles.button} onClick={()=>{if(trigger.current)rememberOverlayTrigger(trigger.current);setReportOpen(true);}}>{copy.report}</button>:<FanMenu label={copy.more} trigger={<FanIconButton ref={trigger} className={styles.moreTrigger} aria-label={copy.more}><Ellipsis size={20} aria-hidden="true" /></FanIconButton>}>
      <FanMenu.Item onSelect={() => { if (trigger.current) rememberOverlayTrigger(trigger.current); setReportOpen(true); }}>{copy.report}</FanMenu.Item>
      {canBlock && <FanMenu.Item destructive disabled={mutation.busy} onSelect={() => void block()}>{copy.block}</FanMenu.Item>}
    </FanMenu>}
    <FanDialog open={reportOpen} onOpenChange={setReportOpen} title={copy.report} closeLabel={fanUiText(locale, "close")} size="sm" initialFocus={reasonField}
      secondary={{ label: copy.cancel, onClick: () => setReportOpen(false), disabled: mutation.busy }}
      primary={{ label: copy.report, onClick: () => void report(), loading: mutation.busy, disabled: !reason.trim() }}>
      <form onSubmit={event => { event.preventDefault(); void report(); }}>
        <label className={styles.field} htmlFor={fieldId}>{copy.reportReason}<textarea ref={reasonField} id={fieldId} required maxLength={500} rows={3} value={reason} disabled={mutation.busy} onChange={event => setReason(event.target.value)} /></label>
      </form>
    </FanDialog>
    {message && <span role="status" className={styles.status}>{message}</span>}{mutation.error && <span role="alert" className={styles.error}>{mutation.error}</span>}
  </div>;
}

export function ContentTranslation({ targetType, targetId, locale, children, sourceText, sourceRevision = 1 }: {
  targetType: TargetType; targetId: string; locale: AppLocale; children: ReactNode; sourceText: string; sourceRevision?: number;
}) {
  const texts = useMemo(() => [sourceText], [sourceText]);
  const target = useMemo(() => ({ targetType, targetId, sourceRevision }), [targetType, targetId, sourceRevision]);
  const { observeElement, ...translation } = useAutomaticTranslation({ texts, locale, target });
  return <div ref={observeElement} className={styles.translation}>
    {translation.showing ? <p className={styles.body} lang={locale}>{translation.texts[0]}</p> : children}
    <TranslationControl locale={locale} translation={translation} />
  </div>;
}
