"use client";

import { createPortal } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import overlayStyles from "./accessible-overlay.module.css";
import { takeOverlayTrigger } from "./focus-return";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const overlayHosts: HTMLElement[] = [];
const originalBodyState = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();
let originalBodyStyle = { overflow: "", position: "", top: "", width: "" };
let lockedScrollY = 0;

function syncDocumentIsolation() {
  if (!document.body) return;
  const top = overlayHosts.at(-1);
  if (!top) {
    for (const [element, state] of originalBodyState) {
      element.inert = state.inert;
      state.ariaHidden === null
        ? element.removeAttribute("aria-hidden")
        : element.setAttribute("aria-hidden", state.ariaHidden);
    }
    originalBodyState.clear();
    document.body.style.overflow = originalBodyStyle.overflow;
    document.body.style.position = originalBodyStyle.position;
    document.body.style.top = originalBodyStyle.top;
    document.body.style.width = originalBodyStyle.width;
    const scrollTo = window.scrollTo as typeof window.scrollTo & { _isMockFunction?: boolean };
    if (!navigator.userAgent.toLowerCase().includes("jsdom") || scrollTo._isMockFunction) {
      scrollTo.call(window, 0, lockedScrollY);
    }
    return;
  }

  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (!originalBodyState.has(child)) {
      originalBodyState.set(child, {
        inert: child.inert,
        ariaHidden: child.getAttribute("aria-hidden"),
      });
    }
    // The shared toast layer stays live and clickable above a modal (its close and retry buttons answer the modal's own action).
    const toastLayer = child.childElementCount === 1 && Boolean(child.firstElementChild?.matches("[data-fan-toast-viewport]"));
    const active = child === top || toastLayer;
    child.inert = !active;
    if (active) child.removeAttribute("aria-hidden");
    else child.setAttribute("aria-hidden", "true");
  }
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.width = "100%";
}

function registerHost(host: HTMLElement) {
  if (overlayHosts.length === 0) {
    originalBodyStyle = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    lockedScrollY = window.scrollY;
  }
  overlayHosts.push(host);
  syncDocumentIsolation();
  return () => {
    const index = overlayHosts.lastIndexOf(host);
    if (index >= 0) overlayHosts.splice(index, 1);
    host.remove();
    syncDocumentIsolation();
  };
}

const HISTORY_KEY = "__fanOverlays";
let historySequence = 0;

function overlayIdsIn(state: unknown): string[] {
  if (!state || typeof state !== "object") return [];
  const ids = (state as Record<string, unknown>)[HISTORY_KEY];
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/**
 * 열린 오버레이마다 같은 주소의 기록 항목을 하나 넣는다. 뒤로가기는 그 항목만 꺼내 오버레이를 닫고 페이지는 그대로 둔다.
 * 다른 방법(X·ESC·배경, 부모가 지움)으로 닫히면 넣은 항목을 되돌린다. 오버레이 안의 링크로 이동했거나 그사이 주소가 바뀌었으면 되돌리지 않는다.
 */
function useOverlayHistoryEntry(open: boolean, closeRef: RefObject<() => void>, navigatingRef: RefObject<boolean>) {
  // React may run the effect's cleanup and body back to back (StrictMode, fast refresh); the entry is undone a tick later only if no re-run follows.
  const heldRef = useRef<{ id: string; href: string; undo?: number } | null>(null);
  useEffect(() => {
    if (!open || typeof window === "undefined" || typeof window.history?.pushState !== "function") return;
    let entry = heldRef.current;
    if (entry?.undo !== undefined) {
      window.clearTimeout(entry.undo);
      entry.undo = undefined;
    } else {
      historySequence += 1;
      entry = { id: `overlay-${historySequence}`, href: window.location.href };
      const base = window.history.state && typeof window.history.state === "object" ? window.history.state as Record<string, unknown> : {};
      window.history.pushState({ ...base, [HISTORY_KEY]: [...overlayIdsIn(base), entry.id] }, "");
      heldRef.current = entry;
      navigatingRef.current = false;
    }
    const held = entry;
    function handlePopState(event: PopStateEvent) {
      if (overlayIdsIn(event.state).includes(held.id)) return;
      heldRef.current = null;
      closeRef.current();
    }
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (heldRef.current !== held) return;
      held.undo = window.setTimeout(() => {
        if (heldRef.current === held) heldRef.current = null;
        const current = overlayIdsIn(window.history.state);
        if (current.at(-1) !== held.id || window.location.href !== held.href) return;
        if (navigatingRef.current) {
          window.history.replaceState({ ...(window.history.state as Record<string, unknown>), [HISTORY_KEY]: current.slice(0, -1) }, "");
          return;
        }
        window.history.back();
      }, 0);
    };
  }, [closeRef, navigatingRef, open]);
}

function isTopOverlay(host: HTMLElement) {
  return overlayHosts.at(-1) === host;
}

function isVisibleFocusable(element: HTMLElement) {
  if (element.hidden || element.closest("[hidden], [aria-hidden=\"true\"], [inert]")) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  // jsdom has no layout engine, so zero rectangles are meaningful only in a browser.
  const hasLayoutEngine = !navigator.userAgent.toLowerCase().includes("jsdom");
  if (hasLayoutEngine && element.getClientRects().length === 0) return false;
  return true;
}

function focusableWithin(content: HTMLElement) {
  return Array.from(content.querySelectorAll<HTMLElement>(focusableSelector))
    .filter(isVisibleFocusable);
}

export type OverlayVariant = "dialog" | "alert-dialog" | "drawer" | "bottom-sheet";

export type AccessibleOverlayProps = {
  open: boolean;
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  role?: "dialog" | "alertdialog";
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  backdropClassName: string;
  contentClassName: string;
  contentAs?: "aside" | "section";
  busy?: boolean;
  variant?: OverlayVariant;
};

export function AccessibleOverlay({
  open,
  children,
  onClose,
  labelledBy,
  describedBy,
  role = "dialog",
  closeOnEscape = true,
  closeOnBackdrop = true,
  initialFocusRef,
  backdropClassName,
  contentClassName,
  contentAs = "aside",
  busy = false,
  variant = "dialog",
}: AccessibleOverlayProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const triggerSelectorRef = useRef<string | null>(null);
  const closeRef = useRef(onClose);
  const navigatingRef = useRef(false);

  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useOverlayHistoryEntry(open, closeRef, navigatingRef);

  useLayoutEffect(() => {
    if (!open) return;
    const rememberedTrigger = takeOverlayTrigger();
    triggerRef.current = rememberedTrigger?.element
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    triggerSelectorRef.current = rememberedTrigger?.selector ?? null;
    const nextHost = document.createElement("div");
    nextHost.dataset.overlayHost = "";
    document.body.append(nextHost);
    const unregister = registerHost(nextHost);
    setHost(nextHost);
    return () => {
      unregister();
      setHost(null);
      window.setTimeout(() => {
        const remembered = triggerRef.current;
        const trigger = triggerSelectorRef.current
          ? document.querySelector<HTMLElement>(triggerSelectorRef.current)
          : remembered?.isConnected
            ? remembered
            : null;
        const top = overlayHosts.at(-1);
        if (trigger && (!top || top.contains(trigger))) trigger.focus();
      }, 250);
    };
  }, [open]);

  useEffect(() => {
    if (!host) return;
    const frame = requestAnimationFrame(() => {
      const content = contentRef.current;
      if (!content) return;
      const preferred = initialFocusRef?.current
        && isVisibleFocusable(initialFocusRef.current)
        ? initialFocusRef.current
        : focusableWithin(content).find((element) => element.hasAttribute("data-autofocus"))
          ?? focusableWithin(content)[0]
        ?? content;
      preferred.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [host, initialFocusRef]);

  useEffect(() => {
    if (!host) return;
    const activeHost = host;
    function handleKeyDown(event: KeyboardEvent) {
      if (!isTopOverlay(activeHost)) return;
      if (event.key === "Escape" && closeOnEscape && !busy) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const content = contentRef.current;
      if (!content) return;
      const focusable = focusableWithin(content);
      if (focusable.length === 0) {
        event.preventDefault();
        content.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || !content.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !content.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [busy, closeOnEscape, host]);

  if (!open || !host) return null;
  const Content = contentAs;
  // The modal is drawn in <body>, outside the page's fan surface: carry the surface's Korean wrapping contract (globals.css,
  // word-break keep-all) when the page is a fan surface, so a title such as "출석체크" never breaks inside a word. Admin pages stay out.
  const fanSurface = host.ownerDocument.querySelector("[data-fan-surface]:not([data-overlay-root])") !== null;
  return createPortal(
    <div
      className={`${overlayStyles.backdrop} ${backdropClassName}`}
      data-overlay-root=""
      data-fan-surface={fanSurface ? "" : undefined}
      data-variant={variant}
      data-reduced-motion="respect"
      onPointerDown={(event) => {
        if (
          event.target === event.currentTarget
          && closeOnBackdrop
          && !busy
          && isTopOverlay(host)
        ) closeRef.current();
      }}
    >
      <Content
        ref={contentRef as RefObject<HTMLElement>}
        className={contentClassName}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-busy={busy || undefined}
        tabIndex={-1}
        data-overlay-content=""
        data-variant={variant}
        onClickCapture={(event) => {
          const link = (event.target as Element | null)?.closest?.("a[href], [data-overlay-navigates]");
          // A button that moves to another address in code (data-overlay-navigates) counts as a link: going back would cancel it.
          if (link instanceof HTMLAnchorElement ? link.target !== "_blank" && !link.hasAttribute("download") : link) navigatingRef.current = true;
        }}
      >
        {children}
      </Content>
    </div>,
    host,
  );
}

type VariantOverlayProps = Omit<AccessibleOverlayProps, "role" | "variant" | "contentAs">;

export function Dialog(props: VariantOverlayProps) {
  return <AccessibleOverlay {...props} variant="dialog" role="dialog" contentAs="section" />;
}

export function AlertDialog(props: VariantOverlayProps) {
  return <AccessibleOverlay {...props} variant="alert-dialog" role="alertdialog" contentAs="section" closeOnBackdrop={props.closeOnBackdrop ?? false} />;
}

export function Drawer(props: VariantOverlayProps) {
  return <AccessibleOverlay {...props} variant="drawer" role="dialog" contentAs="aside" />;
}

export function BottomSheet(props: VariantOverlayProps) {
  return <AccessibleOverlay {...props} variant="bottom-sheet" role="dialog" contentAs="section" />;
}
