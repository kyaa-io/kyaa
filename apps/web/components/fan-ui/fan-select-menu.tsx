"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { FanIcon } from "./fan-icon";
import { FanMenu, type FanMenuRadioItem } from "./fan-menu";
import styles from "./fan-select-menu.module.css";

export type FanSelectMenuProps = Readonly<{
  /** 목록 이름. 알약의 접근 이름과 메뉴 aria-label로 쓴다. */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly FanMenuRadioItem[];
  /** 알약에 보이는 글자. 비우면 선택된 항목의 글자. */
  triggerLabel?: string;
  /** 알약의 접근 이름. 비우면 `목록 이름: 글자`. */
  accessibleName?: string;
  /** 기본값이 아닌 항목이 골라진 상태(분홍 면). */
  active?: boolean;
  disabled?: boolean;
  /** 알약 왼쪽 그림. */
  icon?: LucideIcon;
  /** 좁은 화면(600 미만)에서 글자를 숨기고 그림 버튼 하나로 접는다. `icon`이 있어야 한다. */
  collapseNarrow?: boolean;
  align?: "start" | "end";
  className?: string;
}>;

/** 정렬·필터 드롭다운의 유일한 부품: 높이 36(누르는 영역 44) 알약 + `FanMenu` 목록. 알약 안쪽 여백·글자-화살표 간격·메뉴 항목·체크 자리는 여기서만 정한다.
 * 화면은 값과 항목만 넘기고, 같은 모양을 직접 그리지 않는다(`fan-design-system.contract.test.ts`). */
export function FanSelectMenu({ label, value, onValueChange, options, triggerLabel, accessibleName, active = false, disabled = false, icon, collapseNarrow = false, align = "start", className }: FanSelectMenuProps) {
  const text = triggerLabel ?? (() => { const chosen = options.find((option) => option.value === value)?.label; return typeof chosen === "string" ? chosen : label; })();
  return <FanMenu
    label={label}
    align={align}
    className={styles.menu}
    trigger={<button type="button" disabled={disabled} className={[styles.pill, className ?? ""].filter(Boolean).join(" ")} data-fan-select-pill="" data-active={active ? "" : undefined} data-collapse={collapseNarrow ? "" : undefined} aria-label={accessibleName ?? `${label}: ${text}`}>
      {icon ? <FanIcon icon={icon} size={16} className={styles.icon} /> : null}
      <span className={styles.text}>{text}</span>
      <FanIcon icon={ChevronDown} size={16} className={styles.chevron} />
    </button>}
  >
    <FanMenu.Radio label={label} value={value} onValueChange={onValueChange} items={options} closeOnSelect />
  </FanMenu>;
}
