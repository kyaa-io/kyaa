"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "./fan-action";
import { fanUiText } from "./fan-ui-copy";

/** Back to where the viewer came from. `fallbackHref` is only for a page opened directly with nothing to return to; it stays the link target so a new tab still works. */
export function FanBackAction({ locale, fallbackHref, className }: Readonly<{ locale: AppLocale; fallbackHref: string; className?: string }>) {
  const router = useRouter();
  const back = (event: MouseEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || window.history.length <= 1) return;
    event.preventDefault();
    router.back();
  };
  return <FanAction variant="text" className={className} href={fallbackHref} leadingIcon={<ArrowLeft />} onClick={back}>{fanUiText(locale, "back")}</FanAction>;
}
