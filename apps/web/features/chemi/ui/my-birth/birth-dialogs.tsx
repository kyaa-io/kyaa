"use client";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanText } from "@/components/fan-ui/fan-text";
import type { ChemiBirthSummary } from "@/features/chemi/domain/contracts/profile";
import { fillCopy, type MyBirthCopy } from "../frame/birth-copy";
import styles from "./my-birth.module.css";

/** 저장 동의 전문. 설명 문장 없이 라벨-값 네 줄. */
export function ConsentDialog({ copy, onClose }: Readonly<{ copy: MyBirthCopy; onClose: () => void }>) {
  const rows = [
    [copy.consentStored, copy.consentStoredValue], [copy.consentUsed, copy.consentUsedValue],
    [copy.consentKept, copy.consentKeptValue], [copy.consentNotSent, copy.consentNotSentValue],
  ];
  return <FanDialog open onOpenChange={(open) => { if (!open) onClose(); }} size="md" title={copy.consentItem} closeLabel={copy.close} secondary={{ label: copy.close, onClick: onClose }}>
    <dl className={styles.terms}>{rows.map(([term, value]) => <div key={term}><FanText as="dt" role="meta">{term}</FanText><FanText as="dd" role="body">{value}</FanText></div>)}</dl>
  </FanDialog>;
}

function Scope({ label, rows }: Readonly<{ label: string; rows: readonly (readonly [string, string])[] }>) {
  return <>
    <FanText as="p" role="label" className={styles.scope}>{label}</FanText>
    <ul className={styles.gone}>{rows.map(([name, value]) => <li key={name} data-row=""><FanText role="body">{name}</FanText><FanText role="item">{value}</FanText></li>)}</ul>
  </>;
}

/** 생일 정보 모두 지우기 확인. 지워지는 것·남는 것을 값 줄로 보인다(0인 줄은 뺀다). 남는 것은 결제가 열린 조합에서만. */
export function WipeDialog({ copy, summary, launch, busy, onConfirm, onClose }: Readonly<{
  copy: MyBirthCopy;
  summary: ChemiBirthSummary;
  launch: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}>) {
  const gone: [string, string][] = launch
    ? [[copy.goneBirth, copy.all], [copy.goneChartOnly, copy.all], [copy.goneSaju, copy.all]]
    : [[copy.goneBirth, copy.all], [copy.goneChart, copy.all]];
  if (summary.readingDays > 0) gone.push([copy.goneReadings, fillCopy(copy.goneReadingsValue, { count: summary.readingDays })]);
  if (!launch && summary.askThreads > 0) gone.push([copy.goneAsk, fillCopy(copy.goneAskValue, { count: summary.askThreads })]);
  if (!launch && summary.partners > 0) gone.push([copy.gonePartners, fillCopy(copy.gonePartnersValue, { count: summary.partners })]);
  const kept: [string, string][] = [];
  if (!launch && summary.orders > 0) kept.push([copy.keepOrders, fillCopy(copy.keepOrdersValue, { count: summary.orders })]);
  if (!launch && summary.askPassesLeft > 0) kept.push([copy.keepPasses, fillCopy(copy.keepPassesValue, { count: summary.askPassesLeft })]);
  return <FanDialog
    open alert size="sm" onOpenChange={(open) => { if (!open) onClose(); }}
    title={copy.wipeTitle} closeLabel={copy.close}
    secondary={{ label: copy.cancel, onClick: onClose }}
    primary={{ label: copy.wipeConfirm, onClick: onConfirm, loading: busy, variant: "danger" }}
  >
    <div className={styles.wipe}>
      <Scope label={copy.goneTitle} rows={gone} />
      {kept.length ? <><Scope label={copy.keepTitle} rows={kept} /><FanText as="p" role="meta">{copy.keepLegal}</FanText></> : null}
      <FanText as="p" role="item" className={styles.warn}>{copy.warn}</FanText>
    </div>
  </FanDialog>;
}

/** 궁합 상대 지우기 확인. */
export function PartnerWipeDialog({ copy, name, busy, onConfirm, onClose }: Readonly<{ copy: MyBirthCopy; name: string; busy: boolean; onConfirm: () => void; onClose: () => void }>) {
  return <FanDialog
    open alert size="sm" onOpenChange={(open) => { if (!open) onClose(); }}
    title={copy.partnerWipeTitle} closeLabel={copy.close}
    secondary={{ label: copy.cancel, onClick: onClose }}
    primary={{ label: copy.wipeConfirm, onClick: onConfirm, loading: busy, variant: "danger" }}
  >
    <div className={styles.wipe}>
      <FanText as="p" role="body">{fillCopy(copy.partnerWipeLead, { name })}</FanText>
      <FanText as="p" role="item" className={styles.warn}>{copy.warn}</FanText>
    </div>
  </FanDialog>;
}
