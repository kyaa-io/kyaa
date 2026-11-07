"use client";

import { X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode, type RefObject } from "react";
import { AlertDialog, BottomSheet, Dialog, Drawer } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "./fan-action";
import styles from "./fan-dialog.module.css";

export type FanDialogPrimary = Readonly<{
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "danger";
}>;
export type FanDialogSecondary = Readonly<{ label: string; onClick: () => void; disabled?: boolean }>;

type FanOverlayBase = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** 화면 판독기용 설명. 화면에 소개 문장을 따로 그리지 않는다. */
  description?: string;
  /** X 버튼 라벨(필수). */
  closeLabel: string;
  primary?: FanDialogPrimary;
  secondary?: FanDialogSecondary;
  initialFocus?: RefObject<HTMLElement | null>;
  children?: ReactNode;
  className?: string;
}>;

export type FanDialogProps = FanOverlayBase & Readonly<{
  size?: "sm" | "md" | "lg";
  /** role=alertdialog, 배경 클릭으로 닫히지 않는다. */
  alert?: boolean;
  /** 1024 미만에서 바닥 시트로 바뀐다. */
  responsive?: boolean;
}>;

export type FanSheetProps = FanOverlayBase & Readonly<{
  /** 기본: 1024 미만 바닥, 1024+ 오른쪽 서랍. */
  side?: "bottom" | "right" | "auto";
  snap?: "content" | "half" | "full";
  handle?: boolean;
}>;

const WIDE_QUERY = "(min-width: 64rem)";

/** 1024+ 여부. 서버 렌더와 첫 렌더는 좁은 화면으로 본다(오버레이는 열린 뒤에만 그려서 차이가 보이지 않는다). */
export function useFanWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return wide;
}

function Footer({ primary, secondary, busy }: { primary?: FanDialogPrimary; secondary?: FanDialogSecondary; busy: boolean }) {
  if (!primary && !secondary) return null;
  return <footer className={styles.footer}>
    {secondary ? <FanAction variant="neutral" onClick={secondary.onClick} disabled={secondary.disabled || busy}>{secondary.label}</FanAction> : null}
    {primary ? <FanAction variant={primary.variant === "danger" ? "danger" : "primary"} onClick={primary.onClick} disabled={primary.disabled} loading={primary.loading}>{primary.label}</FanAction> : null}
  </footer>;
}

function Head({ titleId, title, closeLabel, onClose, busy, handle }: { titleId: string; title: ReactNode; closeLabel: string; onClose: () => void; busy: boolean; handle?: boolean }) {
  return <>
    {handle ? <span className={styles.handle} aria-hidden="true" /> : null}
    <header className={styles.head}>
      <h2 id={titleId} className={styles.title}>{title}</h2>
      <button type="button" className={styles.close} onClick={onClose} aria-label={closeLabel} disabled={busy}><X aria-hidden="true" /></button>
    </header>
  </>;
}

/** 바닥 시트(390)와 오른쪽 서랍(1024+). `AccessibleOverlay` 위에 머리·본문·바닥 구성을 붙인다. */
export function FanSheet({ open, onOpenChange, title, description, closeLabel, primary, secondary, initialFocus, children, className, side = "auto", snap = "content", handle = true }: FanSheetProps) {
  const id = useId();
  const wide = useFanWide();
  const resolved = side === "auto" ? (wide ? "right" : "bottom") : side;
  const busy = Boolean(primary?.loading);
  const close = () => onOpenChange(false);
  const Overlay = resolved === "right" ? Drawer : BottomSheet;
  return <Overlay
    open={open}
    onClose={close}
    labelledBy={`${id}-title`}
    describedBy={description ? `${id}-desc` : undefined}
    initialFocusRef={initialFocus}
    busy={busy}
    backdropClassName={`${styles.backdrop} ${resolved === "right" ? styles.backdropRight : styles.backdropBottom}`}
    contentClassName={[styles.panel, styles.sheet, styles[`side-${resolved}`], styles[`snap-${snap}`], className ?? ""].filter(Boolean).join(" ")}
  >
    <Head titleId={`${id}-title`} title={title} closeLabel={closeLabel} onClose={close} busy={busy} handle={handle && resolved === "bottom"} />
    {description ? <p id={`${id}-desc`} className={styles.srOnly}>{description}</p> : null}
    <div className={styles.body} data-fan-overlay-body="">{children}</div>
    <Footer primary={primary} secondary={secondary} busy={busy} />
  </Overlay>;
}

/** 모달. 머리(제목 + X)·본문(최대 70vh 스크롤)·바닥(버튼 최대 2, 강조 버튼 오른쪽). `responsive`면 1024 미만에서 `FanSheet`. */
export function FanDialog(props: FanDialogProps) {
  const { open, onOpenChange, title, description, closeLabel, primary, secondary, initialFocus, children, className, size = "md", alert = false, responsive = false } = props;
  const id = useId();
  const wide = useFanWide();
  if (responsive && !wide) {
    return <FanSheet open={open} onOpenChange={onOpenChange} title={title} description={description} closeLabel={closeLabel} primary={primary} secondary={secondary} initialFocus={initialFocus} className={className} side="bottom">{children}</FanSheet>;
  }
  const busy = Boolean(primary?.loading);
  const close = () => onOpenChange(false);
  const Overlay = alert ? AlertDialog : Dialog;
  return <Overlay
    open={open}
    onClose={close}
    labelledBy={`${id}-title`}
    describedBy={description ? `${id}-desc` : undefined}
    initialFocusRef={initialFocus}
    busy={busy}
    backdropClassName={`${styles.backdrop} ${styles.backdropCenter}`}
    contentClassName={[styles.panel, styles.dialog, styles[`size-${size}`], className ?? ""].filter(Boolean).join(" ")}
  >
    <Head titleId={`${id}-title`} title={title} closeLabel={closeLabel} onClose={close} busy={busy} />
    {description ? <p id={`${id}-desc`} className={styles.srOnly}>{description}</p> : null}
    <div className={styles.body} data-fan-overlay-body="">{children}</div>
    <Footer primary={primary} secondary={secondary} busy={busy} />
  </Overlay>;
}
