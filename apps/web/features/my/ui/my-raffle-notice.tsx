"use client";

import { useCallback, useEffect, useState } from "react";
import { RaffleResultsNotice } from "@/features/benefit/ui/raffle-results-notice";
import type { AppLocale } from "@/i18n/locales";

const KEY = "kyaa:my:raffle-results-seen";

function readSeen(ownerKey: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(`${KEY}:${ownerKey}`) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch { return new Set(); }
}

function writeSeen(ownerKey: string, ids: Set<string>) {
  try { window.localStorage.setItem(`${KEY}:${ownerKey}`, JSON.stringify([...ids].slice(-100))); } catch { /* 저장이 막혀도 이번 화면에서는 숨긴다 */ }
}

/** MY 알림 자리의 래플 결과. 결과 확인으로 들어가면 그 결과들은 다시 띄우지 않고, 새 결과가 나오면 다시 뜬다. 저장이 막히면 보인 채로 둔다. */
export function MyRaffleNotice({ locale, ownerKey, resultIds }: { locale: AppLocale; ownerKey: string; resultIds: readonly string[] }) {
  const [seen, setSeen] = useState<Set<string> | null>(null);
  useEffect(() => { setSeen(readSeen(ownerKey)); }, [ownerKey]);
  const acknowledge = useCallback(() => {
    const next = readSeen(ownerKey);
    for (const id of resultIds) next.add(id);
    writeSeen(ownerKey, next);
    setSeen(next);
  }, [ownerKey, resultIds]);
  if (seen === null || resultIds.every((id) => seen.has(id))) return null;
  return <div onClickCapture={acknowledge}><RaffleResultsNotice locale={locale} /></div>;
}
