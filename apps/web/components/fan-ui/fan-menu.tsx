"use client";

import { Menu } from "@base-ui/react/menu";
import { Check } from "lucide-react";
import type { Route } from "next";
import Link from "./hover-prefetch-link";
import type { ReactElement, ReactNode } from "react";
import styles from "./fan-menu.module.css";

export type FanMenuProps = Readonly<{
  /** 여는 버튼. Base UI가 속성(aria-expanded·ref·onClick)을 합쳐 넣으므로 그 속성을 그대로 DOM에 넘기는 요소여야 한다:
   * 아이콘이면 `<FanIconButton aria-label="…">`, 글자가 있으면 네이티브 버튼에 `fanActionClassName(...)`. `FanAction`은 넘기지 않아 쓸 수 없다. */
  trigger: ReactElement;
  /** 메뉴 aria-label. */
  label: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}>;

function FanMenuRoot({ trigger, label, align = "end", side = "bottom", open, onOpenChange, className, children }: FanMenuProps) {
  return <Menu.Root open={open} onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}>
    <Menu.Trigger render={trigger} />
    <Menu.Portal>
      <Menu.Positioner className={styles.positioner} side={side} align={align} sideOffset={8} collisionPadding={12}>
        <Menu.Popup className={[styles.popup, className ?? ""].filter(Boolean).join(" ")} aria-label={label} data-fan-menu="">
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>;
}

export type FanMenuItemProps = Readonly<{
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
  /** 오른쪽 보조 값(현재 언어 등). */
  trailing?: ReactNode;
  children: ReactNode;
}>;

function FanMenuItem({ icon, onSelect, href, destructive, disabled, trailing, children }: FanMenuItemProps) {
  const content = <>
    {icon ? <span className={styles.icon} aria-hidden="true">{icon}</span> : null}
    <span className={styles.label}>{children}</span>
    {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
  </>;
  return <Menu.Item
    className={styles.item}
    data-destructive={destructive ? "true" : undefined}
    disabled={disabled}
    onClick={onSelect ? () => onSelect() : undefined}
    render={href ? <Link href={href as Route} /> : undefined}
  >{content}</Menu.Item>;
}

export type FanMenuRadioItem = Readonly<{ value: string; label: ReactNode; leading?: ReactNode; description?: ReactNode; disabled?: boolean }>;

function FanMenuRadio({ value, onValueChange, items, label }: Readonly<{ value: string; onValueChange: (value: string) => void; items: readonly FanMenuRadioItem[]; label?: string }>) {
  return <Menu.RadioGroup value={value} onValueChange={(next: unknown) => onValueChange(String(next))} aria-label={label} className={styles.group}>
    {items.map((item) => <Menu.RadioItem key={item.value} value={item.value} disabled={item.disabled} className={styles.item} data-radio="">
      {item.leading ? <span className={styles.leading} aria-hidden="true">{item.leading}</span> : null}
      <span className={styles.text}>
        <span className={styles.label}>{item.label}</span>
        {item.description ? <span className={styles.description}>{item.description}</span> : null}
      </span>
      <Menu.RadioItemIndicator className={styles.check}><Check aria-hidden="true" /></Menu.RadioItemIndicator>
    </Menu.RadioItem>)}
  </Menu.RadioGroup>;
}

function FanMenuSeparator() {
  return <Menu.Separator className={styles.separator} />;
}

/** 드롭다운 메뉴(⋯·계정·최애 선택·정렬). 항목 높이 44, 최소 폭 200, 열림 연출 `--motion-control`. */
export const FanMenu = Object.assign(FanMenuRoot, { Item: FanMenuItem, Radio: FanMenuRadio, Separator: FanMenuSeparator });
