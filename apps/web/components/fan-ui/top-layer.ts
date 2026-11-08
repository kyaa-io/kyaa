"use client";
import { useEffect, useState } from "react";

const topModal = () => {
  const open = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].filter((dialog) => dialog.matches(":modal"));
  return open.at(-1) ?? null;
};

/** The topmost open native modal <dialog> (opened with showModal), or null. Follows dialogs opening and closing anywhere in the page. */
export function useOpenNativeModal() {
  const [modal, setModal] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    const update = () => setModal(topModal());
    update();
    // A dialog opening or closing, or a dialog leaving the page while open (an unmount), moves the toast layer.
    const touchesDialog = (record: MutationRecord) => record.target instanceof HTMLDialogElement
      || [...record.removedNodes].some((node) => node instanceof Element && (node.matches("dialog") || node.querySelector("dialog") !== null));
    const observer = new MutationObserver((records) => { if (records.some(touchesDialog)) update(); });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"], childList: true });
    return () => observer.disconnect();
  }, []);
  return modal;
}
