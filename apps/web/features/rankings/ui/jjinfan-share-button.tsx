"use client";
import { Share2 } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import type { AppLocale } from "@/i18n/locales";
import { jjinfanShareUrl } from "../domain/jjinfan-share";
import { rankingsText } from "./rankings-copy";

/** Share a 찐팬 100 gauge (C7): the system share sheet, or a copied link where there is none. The link previews the server-drawn gauge. */
export function JjinfanShareButton({ slug, name, locale }: { slug: string; name: string; locale: AppLocale }) {
  async function share() {
    const url = jjinfanShareUrl(window.location.origin, slug, locale);
    const title = `${name} · ${rankingsText(locale, "jjTitle")}`;
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title, url }); return; }
      catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      showFanToast({ title: rankingsText(locale, "jjCopied"), tone: "success" });
    } catch {
      showFanToast({ title: rankingsText(locale, "jjCopyFailed"), tone: "error" });
    }
  }
  return <FanAction variant="secondary" size="sm" leadingIcon={<Share2 />} onClick={() => void share()}>{rankingsText(locale, "jjShare")}</FanAction>;
}
