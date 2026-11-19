"use client";

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
  return (
    <div className={styles.toolbar}>
      <FanAction
        {...(typeof back === "string" ? { href: back } : { onClick: back })}
        ariaLabel="뒤로 가기"
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
        재미로 보는 풀이입니다. 중요한 결정의 근거로 쓰지 마세요.
      </FanText>
    </footer>
  );
}
