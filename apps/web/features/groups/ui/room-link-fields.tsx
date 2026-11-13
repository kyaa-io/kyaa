"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { FanText } from "@/components/fan-ui/fan-text";
import { Link2, Plus, X } from "@/components/fan-ui/fan-icons";
import type { AppLocale } from "@/i18n/locales";
import { classifyExternalRoomLink, EXTERNAL_ROOM_LINK_LIMIT, type ExternalRoomLink } from "../domain/external-room-link";
import { groupApplyText } from "./group-apply-copy";
import { managementCopy } from "./management-copy";
import styles from "./room-link-fields.module.css";

type RowState = Readonly<{ link: ExternalRoomLink | null; filled: boolean; duplicate: boolean }>;

/** 방 링크 입력 줄(최대 3). 붙여 넣으면 왼쪽에 서비스 아이콘이 뜬다. 종류는 화면에서 정하지 않는다: 보내는 것은 주소뿐이고, 서버가 다시 판별한다. */
export function useRoomLinkFields({ locale, disabled = false, initial = [] }: { locale: AppLocale; disabled?: boolean; initial?: readonly string[] }): {
  node: ReactNode;
  /** 지금 입력에서 알아본 링크(미리보기용). */
  links: readonly ExternalRoomLink[];
  /** 보낼 주소들. 허용 밖 줄이 있으면 오류를 보이고 null. */
  read: () => { url: string }[] | null;
} {
  const id = useId();
  const remove = managementCopy(locale).remove;
  const [values, setValues] = useState<string[]>(initial.length ? [...initial] : [""]);
  const [seen, setSeen] = useState<ReadonlySet<number>>(new Set());
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const rows: RowState[] = values.map((value, index) => {
    const link = value.trim() ? classifyExternalRoomLink(value) : null;
    const duplicate = Boolean(link) && values.slice(0, index).some((other) => classifyExternalRoomLink(other)?.url === link?.url);
    return { link, filled: Boolean(value.trim()), duplicate };
  });
  const invalid = (index: number) => rows[index]!.filled && (!rows[index]!.link || rows[index]!.duplicate);
  const links = rows.flatMap((row, index) => (row.link && !invalid(index) ? [row.link] : []));
  const markSeen = (index: number) => setSeen((current) => new Set(current).add(index));
  const read = () => {
    const bad = values.findIndex((_, index) => invalid(index));
    if (bad >= 0) {
      setSeen(new Set(values.map((_, index) => index)));
      inputs.current[bad]?.focus();
      return null;
    }
    return rows.flatMap((row) => (row.link ? [{ url: row.link.url }] : []));
  };
  const node = <div className={styles.group} role="group" aria-labelledby={`${id}-label`}>
    <div className={styles.head}>
      <FanText role="item" id={`${id}-label`}>{groupApplyText(locale, "roomLink")}</FanText>
      {values.length < EXTERNAL_ROOM_LINK_LIMIT && <FanAction variant="text" size="sm" disabled={disabled} leadingIcon={<FanIcon icon={Plus} size={16} />} onClick={() => setValues((current) => [...current, ""])}>{groupApplyText(locale, "roomLinkAdd")}</FanAction>}
    </div>
    {values.map((value, index) => {
      const shown = seen.has(index) && invalid(index);
      const kind = rows[index]!.link?.kind;
      return <div key={index} className={styles.line}>
        <div className={styles.row}>
          <div className={styles.field}>
            <span className={styles.icon} aria-hidden="true">{kind ? <img src={`/images/guest-home/${kind}.svg`} width={20} height={20} alt="" data-room-kind={kind} /> : <FanIcon icon={Link2} size={20} />}</span>
            <input ref={(node) => { inputs.current[index] = node; }} className={styles.input} name="externalLink" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={2048} placeholder="https://" value={value} disabled={disabled}
              aria-label={groupApplyText(locale, "roomLink")} aria-invalid={shown || undefined} aria-describedby={shown ? `${id}-error-${index}` : undefined}
              onChange={(event) => setValues((current) => current.map((item, at) => (at === index ? event.target.value : item)))} onBlur={() => markSeen(index)} />
          </div>
          {index > 0 && <FanIconButton aria-label={remove} disabled={disabled} onClick={() => { setValues((current) => current.filter((_, at) => at !== index)); setSeen(new Set()); }}><FanIcon icon={X} size={20} /></FanIconButton>}
        </div>
        {shown && <div id={`${id}-error-${index}`} role="alert"><FanText role="meta" as="p" className={styles.error}>{groupApplyText(locale, "roomLinkInvalid")}</FanText></div>}
      </div>;
    })}
  </div>;
  return { node, links, read };
}
