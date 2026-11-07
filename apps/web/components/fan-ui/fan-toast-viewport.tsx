"use client";

import { Toast } from "@base-ui/react/toast";
import { X } from "lucide-react";
import { useAppLocale } from "@/components/locale-provider";
import { useEffect } from "react";
import { fanToastManager, markFanToastViewportReady, type FanToastData } from "./fan-toast";
import { fanUiText } from "./fan-ui-copy";
import styles from "./fan-toast.module.css";

const MAX_VISIBLE = 2;
const DEFAULT_DURATION = 4000;

function FanToastList({ closeLabel }: { closeLabel: string }) {
  // Provider 안에서 구독이 끝난 뒤 대기열을 내보낸다.
  useEffect(() => { markFanToastViewportReady(true); return () => markFanToastViewportReady(false); }, []);
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

/** 앱 레이아웃에 한 번 둔다. 자리: 390 하단 내비 위 가운데, 1024+ 오른쪽 아래. 최대 2개. 닫기 라벨은 현재 언어. */
export function FanToastViewport() {
  const closeLabel = fanUiText(useAppLocale().locale, "close");
  return <Toast.Provider toastManager={fanToastManager} limit={MAX_VISIBLE} timeout={DEFAULT_DURATION}>
    <Toast.Portal>
      <Toast.Viewport className={styles.viewport} data-fan-toast-viewport="">
        <FanToastList closeLabel={closeLabel} />
      </Toast.Viewport>
    </Toast.Portal>
  </Toast.Provider>;
}
