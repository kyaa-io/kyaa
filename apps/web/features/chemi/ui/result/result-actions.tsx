"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSheet } from "@/components/fan-ui/fan-dialog";
import { ReadingText, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import styles from "./result-actions.module.css";

function subscribeToViewport(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

export function useMobileResultAction(maxWidth = "63.99rem") {
  return useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia?.(`(max-width: ${maxWidth})`).matches ?? false,
    () => false,
  );
}

export type ShareVia = "copy" | "send";

/** 기기 공유창이 있으면 보내기, 없으면 링크 복사. */
export const defaultShareVia = (): ShareVia =>
  typeof navigator !== "undefined" && typeof navigator.share === "function" ? "send" : "copy";

/**
 * 네 결과(사주·운세·별자리·타로)의 보조 행동 한 줄. 주 버튼(이 결과로 질문하기) 아래에 놓인다.
 * 왼쪽은 자랑하기(또는 그 결과만의 행동 하나), 오른쪽은 다른 놀이 보기.
 */
export function ResultActions({
  locale,
  onShare,
  sharing = false,
  lead,
}: {
  locale: string;
  /** 자랑하기를 누르면 부른다. 없으면 자랑하기 자리에 lead 가 온다. */
  onShare?: () => void;
  sharing?: boolean;
  /** 자랑하기 대신 놓는 행동(궁합 풀이의 '다른 사람과'). */
  lead?: ReactNode;
}) {
  return (
    <div className={styles.row} data-result-actions="">
      {onShare ? (
        <FanAction disabled={sharing} onClick={onShare}>
          <ReadingText id="share" />
        </FanAction>
      ) : (
        lead
      )}
      <FanAction href={`/chemi?locale=${locale}`}>
        <ReadingText id="otherGames" />
      </FanAction>
    </div>
  );
}

/** 자랑하기 판: 보내기 · 링크 복사가 바닥 버튼이고, 그 결과만의 행동(카드 미리 보기 · 이미지 저장 · 장면 다시 보기)은 본문에 놓인다. */
export function ShareSheet({
  open,
  onOpenChange,
  sharing,
  onShare,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sharing: boolean;
  onShare: (via: ShareVia) => void;
  children?: ReactNode;
}) {
  const text = useReadingCopy();
  const canSend = defaultShareVia() === "send";
  return (
    <FanSheet
      open={open}
      onOpenChange={onOpenChange}
      title={text("share")}
      closeLabel={text("close")}
      secondary={canSend ? { label: text("copyLink"), onClick: () => onShare("copy") } : undefined}
      primary={
        canSend
          ? { label: text("send"), loading: sharing, onClick: () => onShare("send") }
          : { label: text("copyLink"), loading: sharing, onClick: () => onShare("copy") }
      }
    >
      {children ? <div className={styles.sheet}>{children}</div> : null}
    </FanSheet>
  );
}
