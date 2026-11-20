"use client";

import { createContext, useContext, type ReactNode } from "react";
import ko from "./locales/ko/chemi.json";

type Catalog = Pick<typeof ko, "home" | "sajuScene" | "readingUi">;
const ReadingCatalog = createContext<Catalog>(ko);

export function useReadingCopy() {
  const catalog = useContext(ReadingCatalog);
  return (key: keyof Catalog["readingUi"]) => catalog.readingUi[key] || ko.readingUi[key];
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
