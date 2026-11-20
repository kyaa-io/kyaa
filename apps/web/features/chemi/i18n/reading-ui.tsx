"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { fillCopy, mergeMyBirthCopy } from "@/features/chemi/ui/frame/birth-copy";
import ko from "./locales/ko/chemi.json";

type Catalog = Pick<typeof ko, "home" | "sajuScene" | "readingUi" | "myBirth">;
const ReadingCatalog = createContext<Catalog>(ko);

export function useReadingCopy() {
  const catalog = useContext(ReadingCatalog);
  return useCallback((key: keyof Catalog["readingUi"], values?: Record<string, string | number>) => {
    const template = catalog.readingUi[key] || ko.readingUi[key];
    return values ? fillCopy(template, values) : template;
  }, [catalog]);
}

export function ReadingText({ id }: { id: keyof Catalog["readingUi"] }) {
  const text = useReadingCopy();
  return <>{text(id)}</>;
}

export function ReadingTitle({ id }: { id: keyof Catalog["home"] }) {
  const catalog = useContext(ReadingCatalog);
  return <>{catalog.home[id] || ko.home[id]}</>;
}

export function ReadingCopyProvider({ value, children }: { value: Catalog; children: ReactNode }) {
  return <ReadingCatalog.Provider value={value}>{children}</ReadingCatalog.Provider>;
}

export function useReadingBirthCopy() {
  return mergeMyBirthCopy(ko.myBirth, useContext(ReadingCatalog).myBirth);
}

export function useSajuSceneCopy() {
  const catalog = useContext(ReadingCatalog);
  return { ...catalog.sajuScene, title: catalog.home.saju || ko.home.saju };
}
