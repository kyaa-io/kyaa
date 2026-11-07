"use client";

import { Toast } from "@base-ui/react/toast";
import dynamic from "next/dynamic";
import { useCallback } from "react";

export type FanToastTone = "neutral" | "success" | "error";
export type FanToastOptions = Readonly<{
  title: string;
  description?: string;
  tone?: FanToastTone;
  action?: Readonly<{ label: string; onClick: () => void }>;
  /** ms. 기본 4000, 0이면 사용자가 닫을 때까지. */
  duration?: number;
}>;

export type FanToastData = { tone: FanToastTone };

/** 앱 전체 하나. 훅이 Provider 안이 아니어도(헤더·전역 오류 처리) 같은 큐에 넣는다. */
export const fanToastManager = Toast.createToastManager<FanToastData>();
const manager = fanToastManager;
const openByTitle = new Map<string, string>();
const DEFAULT_DURATION = 4000;

/** 같은 title은 새로 쌓지 않고 기존 것을 바꾼다. 서버 응답이 화면에 보이지 않는 곳(댓글 저장·업로드 실패·교환 완료·지급 실패)에만 쓴다.
 * 포인트 지급 성공은 `PointRewardBurst`, 폼 안 오류는 입력 아래 오류 글자가 맡는다. */
let viewportReady = false;
const pending: FanToastOptions[] = [];

/** 표시부가 붙은 뒤 한 번 부른다. 그 전에 들어온 토스트를 순서대로 내보낸다. */
export function markFanToastViewportReady(ready: boolean) {
  viewportReady = ready;
  if (ready) for (const options of pending.splice(0)) showFanToast(options);
}

export function showFanToast({ title, description, tone = "neutral", action, duration = DEFAULT_DURATION }: FanToastOptions): string {
  if (!viewportReady) {
    const index = pending.findIndex((item) => item.title === title);
    const queued = { title, description, tone, action, duration };
    if (index >= 0) pending[index] = queued; else pending.push(queued);
    return "";
  }
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

/** 표시부(Toast.Provider·Viewport)는 첫 로드에 넣지 않는다. 루트 레이아웃의 `<FanToastProvider />`가 화면이 뜬 뒤 불러온다. */
const LazyViewport = dynamic(() => import("./fan-toast-viewport").then((module) => module.FanToastViewport), { ssr: false });
export function FanToastProvider() {
  return <LazyViewport />;
}
