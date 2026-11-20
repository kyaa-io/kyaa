"use client";

import { useEffect, useState } from "react";
import { FanText } from "@/components/fan-ui/fan-text";
import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { loadParticipation, type Participation } from "./saju/reading";

export function ParticipationCount({ locale }: { locale: string }) {
  const text = useReadingCopy();
  const [value, setValue] = useState<Participation>(null);
  useEffect(() => {
    const controller = new AbortController();
    void loadParticipation(controller.signal).then(setValue).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!value || value.count <= 0) return null;
  return <FanText role="meta">{text(`${value.period}Views`, { count: value.count.toLocaleString(locale) })}</FanText>;
}
