"use client";

import { Toast } from "@base-ui/react/toast";
import { X } from "lucide-react";
import { useCallback } from "react";
import { useAppLocale } from "@/components/locale-provider";
import { fanUiText } from "./fan-ui-copy";
import styles from "./fan-toast.module.css";

export type FanToastTone = "neutral" | "success" | "error";
export type FanToastOptions = Readonly<{
  title: string;
  description?: string;
  tone?: FanToastTone;
  action?: Readonly<{ label: string; onClick: () => void }>;
  /** ms. 기본 4000, 0이면 사용자가 닫을 때까지. */
  duration?: number;
}>;

type ToastData = { tone: FanToastTone };

/** 앱 전체 하나. 훅이 Provider 안이 아니어도(헤더·전역 오류 처리) 같은 큐에 넣는다. */
const manager = Toast.createToastManager<ToastData>();
const openByTitle = new Map<string, string>();
const MAX_VISIBLE = 2;
const DEFAULT_DURATION = 4000;

/** 같은 title은 새로 쌓지 않고 기존 것을 바꾼다. 서버 응답이 화면에 보이지 않는 곳(댓글 저장·업로드 실패·교환 완료·지급 실패)에만 쓴다.
 * 포인트 지급 성공은 `PointRewardBurst`, 폼 안 오류는 입력 아래 오류 글자가 맡는다. */
export function showFanToast({ title, description, tone = "neutral", action, duration = DEFAULT_DURATION }: FanToastOptions): string {
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

export function closeFanToast(id?: string) {
  manager.close(id);
}

/** `const toast = useFanToast(); toast({ title, tone: "error", action: { label, onClick } })` */
export function useFanToast() {
  return useCallback((options: FanToastOptions) => showFanToast(options), []);
}

function FanToastList({ closeLabel }: { closeLabel: string }) {
  const { toasts } = Toast.useToastManager<ToastData>();
  return toasts.map((toast) => <Toast.Root key={toast.id} toast={toast} className={styles.toast} data-tone={toast.data?.tone ?? "neutral"} swipeDirection={["down", "right"]}>
    <Toast.Content className={styles.content}>
      <Toast.Title className={styles.title} />
      {toast.description ? <Toast.Description className={styles.description} /> : null}
    </Toast.Content>
    {toast.actionProps ? <Toast.Action className={styles.action} /> : null}
    <Toast.Close className={styles.close} aria-label={closeLabel}><X aria-hidden="true" /></Toast.Close>
  </Toast.Root>);
}

/** 앱 레이아웃에 한 번 둔다. 자리: 390 하단 내비 위 가운데, 1024+ 오른쪽 아래. 최대 2개. 닫기 라벨은 현재 언어. */
export function FanToastProvider() {
  const closeLabel = fanUiText(useAppLocale().locale, "close");
  return <Toast.Provider toastManager={manager} limit={MAX_VISIBLE} timeout={DEFAULT_DURATION}>
    <Toast.Portal>
      <Toast.Viewport className={styles.viewport} data-fan-toast-viewport="">
        <FanToastList closeLabel={closeLabel} />
      </Toast.Viewport>
    </Toast.Portal>
  </Toast.Provider>;
}
