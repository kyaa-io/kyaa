import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { AppLocale } from "@/i18n/locales";
import { myHomeText } from "./my-home-copy";
import styles from "./my-shortcuts.module.css";

export type MyShortcut = { key: string; href: string; label: string; art: string };

/** 바로가기: 한 카드 안에 같은 행 형식(컬러 일러스트 아이콘 · 이름 · 화살표)으로 늘어선다. 비로그인은 같은 구성에 로그인 주소를 넘긴다. */
export function MyShortcuts({ locale, items }: { locale: AppLocale; items: MyShortcut[] }) {
  return <section className={styles.section} aria-labelledby="my-shortcuts-title">
    <h2 id="my-shortcuts-title">{myHomeText(locale, "shortcutsTitle")}</h2>
    <nav className={styles.grid} aria-label={myHomeText(locale, "shortcutsTitle")}>
      {items.map(({ key, href, label, art }) => <Link key={key} href={href as Route} data-shortcut={key}>
        <img src={`/images/my/shortcuts/${art}.webp`} alt="" width={40} height={40} loading="lazy" decoding="async" />
        <strong>{label}</strong>
        <ChevronRight aria-hidden="true" />
      </Link>)}
    </nav>
  </section>;
}
