"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AppLocale } from "@/i18n/locales";
import { sajuTx, type SajuPack, type Tx } from "./tx";

const SajuTxContext = createContext<Tx | null>(null);

/** 선택 언어의 사주 문장 묶음을 결과 화면 아래로 내려 준다. 한국어는 묶음 없이 null 이다. */
export function SajuTxProvider({ locale, pack, children }: { locale: AppLocale; pack: SajuPack | null; children: ReactNode }) {
  const tx = useMemo(() => sajuTx(locale, pack), [locale, pack]);
  return <SajuTxContext.Provider value={tx}>{children}</SajuTxContext.Provider>;
}

export const useSajuTx = () => useContext(SajuTxContext);
