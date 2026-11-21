"use client";

import { useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import type { AppLocale } from "@/i18n/locales";
import { AskScene } from "./ask-scene";
import { askOpenWith, useAskLocation } from "./location";
import type { AskCharacter, AskContent } from "./lines";
import styles from "./deep-result-ask.module.css";

export function useDeepResultAsk(locale: AppLocale, content: AskContent, character: AskCharacter) {
  const at = useAskLocation();
  const readingId = at ? new URLSearchParams(location.search).get("ar") : null;
  return readingId && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(readingId) && at ? <AskScene {...{ locale, content, character, readingId, at }} /> : null;
}

export function DeepResultAsk({ name, reading, fixed = true }: {
  name: string;
  reading: () => string | Promise<string>;
  fixed?: boolean;
}) {
  const text = useReadingCopy();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function open() {
    setBusy(true);
    setFailed(false);
    try {
      askOpenWith({ ar: await reading() }, {});
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={fixed ? styles.fixed : styles.inPanel} data-deep-result-ask="">
      {failed && <div role="alert"><FanText as="p" role="body">{text("loadFailure")}</FanText></div>}
      <FanAction variant="primary" fullWidth loading={busy} onClick={open}>
        {text("askFavorite", { name })}
      </FanAction>
    </div>
  );
}
