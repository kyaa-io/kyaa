"use client";
import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { GroupImage } from "@/features/groups/ui/group-image";
import type { AppLocale } from "@/i18n/locales";
import { CreatorAvatar } from "./creator-avatar";
import { FanTag } from "./fan-tag";
import { fanUiText, type FanUiCopyKey } from "./fan-ui-copy";
import styles from "./fan-entity-card.module.css";

export type FanPageKind = "fan" | "group" | "hobby" | "brand";
const KIND_LABEL: Record<FanPageKind, FanUiCopyKey> = { fan: "kindFan", group: "kindGroup", hobby: "kindHobby", brand: "kindBrand" };
export const fanPageKindLabel = (locale: AppLocale, kind: FanPageKind) => fanUiText(locale, KIND_LABEL[kind]);
export const fanPageKindTone = (kind: FanPageKind) => (kind === "fan" ? "fan" : "neutral") as "fan" | "neutral";

export type FanPageImage = Readonly<{ src?: string | null; slug?: string | null; alt?: string }>;

/** 페이지 이미지 하나: 크리에이터 사진은 CreatorAvatar, 그 밖은 GroupImage, 사진이 없으면 이름 앞 두 글자. */
export function FanPageImageSlot({ image, name, locale, size, className }: Readonly<{ image: FanPageImage; name: string; locale: AppLocale; size: number | { mobile: number; desktop: number }; className?: string }>) {
  const largest = typeof size === "number" ? size : size.desktop;
  if (image.slug) return <span className={className}><CreatorAvatar slug={image.slug} src={image.src} size={size} photos={undefined} alt={image.alt ?? ""} /></span>;
  if (image.src) return <GroupImage locale={locale} src={image.src} alt={image.alt ?? ""} className={className} width={largest * 2} height={largest * 2} />;
  return <span className={[className, styles.fallbackSlot].filter(Boolean).join(" ")} aria-hidden="true"><span className={styles.fallback}>{Array.from(name.replace(/^[^\p{L}\p{N}]+/u, "") || name).slice(0, 2).join("")}</span></span>;
}

/** 페이지 한 개를 나타내는 칸. 한 칸은 2줄이다: 이름 / 유형 태그 + 팬 수.
 * `list`는 모임 목록의 구분선 행이다: 외곽선·화살표가 없고, 팬페이지면 유형 태그를 빼며, 팬 수가 0이면 숫자를 쓰지 않는다. */
export function FanEntityCard({ href, image, name, kind, locale, memberCount, trailing, size = "card", className }: Readonly<{
  href: string;
  image: FanPageImage;
  name: string;
  kind: FanPageKind;
  locale: AppLocale;
  memberCount?: number;
  trailing?: ReactNode;
  /** `card`는 1px 외곽선이 있는 칸, `row`는 목록 안에서 아래 선으로 나뉘는 행, `list`는 이름 시작선부터 선이 그어지는 목록 행이다. */
  size?: "row" | "card" | "list";
  className?: string;
}>) {
  const list = size === "list";
  const showKind = !list || kind !== "fan";
  // S4: no `팬 0` on any size; a zero count is left out like everywhere else in the directory.
  const count = memberCount ? memberCount : undefined;
  return <Link href={href as Route} className={[styles.entity, styles[size], className ?? ""].filter(Boolean).join(" ")} data-fan-entity={kind}>
    <FanPageImageSlot image={image} name={name} locale={locale} size={48} className={styles.image} />
    <span className={styles.copy}>
      <strong className={styles.name}>{name}</strong>
      {(showKind || count !== undefined) && <span className={styles.meta}>{showKind && <FanTag tone={fanPageKindTone(kind)}>{fanPageKindLabel(locale, kind)}</FanTag>}{count !== undefined && <span>{fanUiText(locale, "fanCount", [count.toLocaleString(locale)])}</span>}</span>}
    </span>
    {list ? trailing && <span className={styles.trailing}>{trailing}</span> : <span className={styles.trailing}>{trailing ?? <ChevronRight size={16} aria-hidden="true" />}</span>}
  </Link>;
}
