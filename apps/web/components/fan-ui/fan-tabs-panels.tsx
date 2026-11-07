"use client";

import { Tabs } from "@base-ui/react/tabs";
import { useState } from "react";
import { TabLabel, type FanTabItem } from "./fan-tabs";
import styles from "./fan-tabs.module.css";

export function FanPanelTabs({ variant, label, current, items, id, className }: Readonly<{ variant: "underline" | "chip" | "segment"; label: string; current: string; items: readonly FanTabItem[]; id?: string; className?: string }>) {
  // 상태 탭은 화면 안에서 바뀐다. 부모가 `current`를 바꾸면 그 값을 따른다.
  const [selected, setSelected] = useState(current);
  const [lastCurrent, setLastCurrent] = useState(current);
  if (lastCurrent !== current) { setLastCurrent(current); setSelected(current); }
  const select = setSelected;
  const cls = [styles.tabs, styles[variant], className ?? ""].filter(Boolean).join(" ");
  return <Tabs.Root value={selected} onValueChange={(value) => {
    const item = items.find((candidate) => candidate.key === value);
    if (item) { select(item.key); item.onSelect?.(); }
  }}>
    <Tabs.List id={id} className={cls} aria-label={label} data-fan-tabs={variant} data-items={items.length} activateOnFocus>
      {items.map((item) => <Tabs.Tab key={item.key} value={item.key} className={styles.tab} onPointerEnter={item.onPreload} onTouchStart={item.onPreload}><TabLabel item={item} /></Tabs.Tab>)}
    </Tabs.List>
    {items.map((item) => item.panel === undefined || item.key !== selected ? null : <Tabs.Panel key={item.key} value={item.key} className={styles.panel}>{item.panel}</Tabs.Panel>)}
  </Tabs.Root>;
}

