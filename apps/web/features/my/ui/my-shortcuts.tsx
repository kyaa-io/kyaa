import { ArrowRight, type LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { AppLocale } from "@/i18n/locales";
import { myHomeText } from "./my-home-copy";
import styles from "./my-shortcuts.module.css";

export type MyShortcut = { key: string; href: string; label: string; Icon: LucideIcon };

/** 바로가기: 자주 쓰는 넷은 아이콘 격자(글자 위), 드물게 쓰는 것은 아래 글자 목록. 비로그인은 같은 구성에 로그인 주소를 넘긴다. */
export function MyShortcuts({ locale, frequent, rest }: { locale: AppLocale; frequent: MyShortcut[]; rest: MyShortcut[] }) {
  return <section className={styles.section} aria-labelledby="my-shortcuts-title">
    <h2 id="my-shortcuts-title">{myHomeText(locale, "shortcutsTitle")}</h2>
    <nav className={styles.grid} aria-label={myHomeText(locale, "shortcutsTitle")}>
      {frequent.map(({ key, href, label, Icon }) => <Link key={key} href={href as Route} data-shortcut={key}><span aria-hidden="true"><Icon /></span><strong>{label}</strong></Link>)}
    </nav>
    <nav className={styles.list} aria-label={myHomeText(locale, "moreShortcuts")}>
      {rest.map(({ key, href, label, Icon }) => <Link key={key} href={href as Route} data-shortcut={key}><Icon aria-hidden="true" /><span>{label}</span><ArrowRight aria-hidden="true" /></Link>)}
    </nav>
  </section>;
}
