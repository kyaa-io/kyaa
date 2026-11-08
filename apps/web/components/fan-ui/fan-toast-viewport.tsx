"use client";

import { Toast } from "@base-ui/react/toast";
import { X } from "lucide-react";
import { useEffect } from "react";
import { useOpenNativeModal } from "./top-layer";
import { useAppLocale } from "@/components/locale-provider";
import { registerFanToastHandler, type FanToastOptions, type FanToastTone } from "./fan-toast";
import { fanUiText } from "./fan-ui-copy";
import styles from "./fan-toast.module.css";

type FanToastData = { tone: FanToastTone };
const manager = Toast.createToastManager<FanToastData>();
const openByTitle = new Map<string, string>();
const MAX_VISIBLE = 2;
const DEFAULT_DURATION = 4000;

function show({ title, description, tone = "neutral", action, duration = DEFAULT_DURATION }: FanToastOptions): string {
  const options = {
    title,
    description,
    timeout: duration,
    priority: tone === "error" ? "high" as const : "low" as const,
    type: tone,
    data: { tone },
    actionProps: action ? { children: action.label, onClick: action.onClick } : undefined,
  };
  const existing = openByTitle.get(title);
  if (existing) {
    manager.update(existing, options);
    return existing;
  }
  const id = manager.add({ ...options, onRemove: () => { if (openByTitle.get(title) === id) openByTitle.delete(title); } });
  openByTitle.set(title, id);
  return id;
}

function FanToastList({ closeLabel }: { closeLabel: string }) {
  // Provider 안에서 구독이 끝난 뒤 처리기를 등록해 대기열을 내보낸다.
  useEffect(() => { registerFanToastHandler({ show, close: (id) => manager.close(id) }); return () => registerFanToastHandler(null); }, []);
  const { toasts } = Toast.useToastManager<FanToastData>();
  return toasts.map((toast) => <Toast.Root key={toast.id} toast={toast} className={styles.toast} data-tone={toast.data?.tone ?? "neutral"} swipeDirection={["down", "right"]}>
    <Toast.Content className={styles.content}>
      <Toast.Title className={styles.title} />
      {toast.description ? <Toast.Description className={styles.description} /> : null}
    </Toast.Content>
    {toast.actionProps ? <Toast.Action className={styles.action} /> : null}
    <Toast.Close className={styles.close} aria-label={closeLabel}><X aria-hidden="true" /></Toast.Close>
  </Toast.Root>);
}

/** 자리: 390 하단 내비 위 가운데, 1024+ 오른쪽 아래. 최대 2개. 닫기 라벨은 현재 언어. */
export function FanToastViewport() {
  const closeLabel = fanUiText(useAppLocale().locale, "close");
  // A native modal <dialog> sits in the browser's top layer above any z-index and makes everything outside it inert, so while one is
  // open the toast layer is drawn inside it (visible and clickable); otherwise in <body> above every z-indexed modal (261107-2 r4).
  const modal = useOpenNativeModal();
  return <Toast.Provider toastManager={manager} limit={MAX_VISIBLE} timeout={DEFAULT_DURATION}>
    <Toast.Portal container={modal ?? undefined}>
      <Toast.Viewport className={styles.viewport} data-fan-toast-viewport="">
        <FanToastList closeLabel={closeLabel} />
      </Toast.Viewport>
    </Toast.Portal>
  </Toast.Provider>;
}
