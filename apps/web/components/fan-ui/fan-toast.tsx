"use client";

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

/** 표시부(fan-toast-viewport)가 붙으면 등록하는 처리기. 이 파일은 Base UI를 가져오지 않아 첫 로드 JS가 늘지 않는다. */
export type FanToastHandler = Readonly<{ show: (options: FanToastOptions) => string; close: (id?: string) => void }>;

let handler: FanToastHandler | null = null;
const pending: FanToastOptions[] = [];

/** 표시부가 붙거나 떨어질 때 부른다. 붙기 전에 들어온 토스트는 순서대로 내보낸다. */
export function registerFanToastHandler(next: FanToastHandler | null) {
  handler = next;
  if (next) for (const options of pending.splice(0)) next.show(options);
}

/** 같은 title은 새로 쌓지 않고 기존 것을 바꾼다. 서버 응답이 화면에 보이지 않는 곳(댓글 저장·업로드 실패·교환 완료·지급 실패)에만 쓴다.
 * 포인트·도장 지급은 `celebrateReward`(reward-celebration.ts)가 이 토스트와 코인 뱃지를 함께 띄운다. 폼 안 오류는 입력 아래 오류 글자가 맡는다. */
export function showFanToast(options: FanToastOptions): string {
  if (handler) return handler.show(options);
  const index = pending.findIndex((item) => item.title === options.title);
  if (index >= 0) pending[index] = options; else pending.push(options);
  return "";
}

export function closeFanToast(id?: string) {
  if (!id) pending.length = 0;
  handler?.close(id);
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
