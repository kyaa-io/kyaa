"use client";
import { ArrowLeft } from "lucide-react";
import type { FormEventHandler, ReactNode, Ref } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { EarnBadgeCorner } from "@/features/dukjil/ui/earn-badge";
import type { AppLocale } from "@/i18n/locales";
import styles from "./post-editor-form.module.css";

/** A labelled select in the options row of the write form. */
export function PostEditorSelect<Value extends string>({ label, value, onChange, disabled, options }: { label: string; value: Value; onChange: (value: Value) => void; disabled?: boolean; options: readonly { value: Value; label: string }[] }) {
  return <label className={styles.field}><span className={styles.label}>{label}</span><select className={styles.control} value={value} disabled={disabled} onChange={event => onChange(event.target.value as Value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

/**
 * The one write form of the fan board and group boards. Each board keeps its own state, limits, permissions and save path;
 * this owns what the writer sees: back, heading, title, body, options, cancel and write, in that order.
 */
export function PostEditorForm({ locale, formRef, onSubmit, heading, headingId, backLabel, onBack, gate, locked, disabled, titleLabel, title, onTitleChange, titleMaxLength, titleAutoFocus, bodyLabel, body, options, alerts, cancelLabel, onCancel, cancelDisabled, submitLabel, submitDisabled, submitBusy, reward = false }: {
  locale: AppLocale; formRef?: Ref<HTMLFormElement>; onSubmit: FormEventHandler<HTMLFormElement>;
  heading?: string; headingId?: string; backLabel?: string; onBack?: () => void; gate?: ReactNode; locked?: boolean; disabled?: boolean;
  titleLabel: string; title: string; onTitleChange: (value: string) => void; titleMaxLength: number; titleAutoFocus?: boolean;
  bodyLabel: string; body: ReactNode; options?: ReactNode; alerts?: ReactNode;
  cancelLabel: string; onCancel?: () => void; cancelDisabled?: boolean; submitLabel: string; submitDisabled: boolean; submitBusy?: boolean; reward?: boolean;
}) {
  const submit = <FanAction variant="primary" type="submit" disabled={submitDisabled} ariaBusy={submitBusy} loading={submitBusy}>{submitLabel}</FanAction>;
  return <form ref={formRef} className={styles.form} data-post-composer="" aria-labelledby={heading ? headingId ?? undefined : undefined} aria-label={heading && headingId ? undefined : heading ?? submitLabel} onSubmit={onSubmit}>
    {gate}
    <fieldset className={styles.fields} disabled={locked}>
      {heading && backLabel && onBack && <div data-editor-part="back" className={styles.back}><FanAction variant="text" leadingIcon={<ArrowLeft />} onClick={onBack}>{backLabel}</FanAction></div>}
      {heading && <h2 id={headingId} data-editor-part="heading" className={styles.heading}>{heading}</h2>}
      <label data-editor-part="title" className={styles.field}><span className={styles.label}>{titleLabel}</span><input className={styles.control} required maxLength={titleMaxLength} value={title} disabled={disabled} autoFocus={titleAutoFocus} onChange={event => onTitleChange(event.target.value)} /></label>
      <div data-editor-part="body" className={styles.field}><span className={styles.label}>{bodyLabel}</span>{body}</div>
      {options && <div data-editor-part="options" className={styles.options}>{options}</div>}
      {alerts}
      <div data-editor-part="actions" className={styles.actions}>
        {onCancel && <FanAction disabled={cancelDisabled} onClick={onCancel}>{cancelLabel}</FanAction>}
        {reward ? <EarnBadgeCorner action="post" locale={locale} className={styles.submit}>{submit}</EarnBadgeCorner> : <span className={styles.submit}>{submit}</span>}
      </div>
    </fieldset>
  </form>;
}
