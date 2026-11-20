"use client";

import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { ReadingText } from "@/features/chemi/i18n/reading-ui";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { ChevronLeft } from "@/components/fan-ui/fan-icons";
import { FanText } from "@/components/fan-ui/fan-text";
import type { ReactNode } from "react";
import styles from "./result.module.css";

export const art = "/chemi/star";

export function Toolbar({
  name,
  back,
  meta,
}: {
  name: string;
  /** 주소면 링크, 함수면 눌렀을 때 실행. */
  back: string | (() => void);
  meta?: ReactNode;
}) {
  const uiText = useReadingCopy();
  return (
    <div className={styles.toolbar}>
      <FanAction
        {...(typeof back === "string" ? { href: back } : { onClick: back })}
        ariaLabel={uiText("back")}
        leadingIcon={<FanIcon icon={ChevronLeft} />}
        className={styles.round}
      />
      <FanText role="label" className={styles.chip}>
        {name}
      </FanText>
      {meta}
    </div>
  );
}

/** 최애 한마디 + 다음 행동. 390에서는 탭바 위에 고정된다. */
export function Reaction({
  character,
  name,
  line,
  action,
  extra,
}: {
  character: string;
  name: string;
  line: string;
  action: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <section className={styles.reaction}>
      <img src={`${art}/avatar-${character}-v1.jpg`} alt="" />
      <FanText as="strong" role="item" className={styles.said}>
        {name}
      </FanText>
      <FanText as="p" role="body">
        {line}
      </FanText>
      <div className={styles.cta}>{action}</div>
      {extra}
    </section>
  );
}

export function Legal() {
  return (
    <footer className={styles.legal}>
      <FanText as="p" role="meta">
        <ReadingText id="fun" />
      </FanText>
    </footer>
  );
}
