import { LockKeyhole } from "lucide-react";

import { messages as localizedMessages } from "@/i18n/catalogs/components__fan-ui__fan-locked-value";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import styles from "./fan-locked-value.module.css";

const LOCKED_LABEL_KO = "로그인 후 확인";

/** 비로그인 화면의 내 값 칸. 값 글자 크기와 줄 높이는 부모가 정한다. 누르는 대상이 아니다. */
export function FanLockedValue({ locale, className }: Readonly<{ locale: AppLocale; className?: string }>) {
  const label = locale === "ko" ? LOCKED_LABEL_KO : translate(locale, localizedMessages.m1dcdb3d77594, "Sign in to view");
  return (
    <span className={[styles.value, className ?? ""].filter(Boolean).join(" ")} role="img" aria-label={label}>
      <LockKeyhole size={24} aria-hidden="true" />
    </span>
  );
}

/** 비로그인 화면의 내 목록 자리. 로딩이 아니므로 움직이지 않고 aria-busy를 쓰지 않는다. */
export function FanLockedRows({ rows, className }: Readonly<{ rows: 2 | 3 | 5; className?: string }>) {
  return (
    <div className={[styles.rows, className ?? ""].filter(Boolean).join(" ")} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className={styles.row} key={index}>
          <span className={styles.barLabel} />
          <span className={styles.barValue} />
        </div>
      ))}
    </div>
  );
}
