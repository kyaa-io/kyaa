"use client";
import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/components__notice__notice-share";
import { translate } from "@/i18n/messages";
import { useState } from "react";
import { Share2 } from "lucide-react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { recordShareCompleted } from "@/features/analytics/client/share-event";
import styles from "./notice-detail.module.css";

export function NoticeShare({ title, locale, contentType = "notice" }: { title: string; locale: AppLocale; contentType?: "notice" | "post" }) {
  const [message, setMessage] = useState("");
  const { authenticated, getAccessToken } = useByUsAuth();
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, url: location.href });
        recordShareCompleted("native", contentType, authenticated ? getAccessToken : undefined);
      } else {
        await navigator.clipboard.writeText(location.href);
        recordShareCompleted("copy", contentType, authenticated ? getAccessToken : undefined);
        setMessage(locale === "ko" ? "링크를 복사했어요." : translate(locale, localizedMessages.m96ab9ba3d597, "Link copied."));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(locale === "ko" ? "링크를 복사하지 못했어요." : translate(locale, localizedMessages.m93c5d18febb9, "Could not copy the link."));
    }
  }
  return <><button className={styles.share} type="button" onClick={share} aria-label={locale === "ko" ? `공유: ${title}` : translate(locale, localizedMessages.m6e9cac39f17f, "Share: {0}", [title])}><Share2 aria-hidden="true" />{locale === "ko" ? "공유" : translate(locale, localizedMessages.m3327f2162cbe, "Share")}</button><span className={styles.srOnly} aria-live="polite">{message}</span></>;
}
