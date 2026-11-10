"use client";
import { useCallback, useState } from "react";

/** One open row at a time. The key is the row's identity (creator slug, fan row key), not its place, so a re-read that reorders the list keeps the same row open.
 * The same key again closes it; another key moves the opening there. */
export function useRankExpand() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = useCallback((key: string) => setOpenKey((current) => (current === key ? null : key)), []);
  return { openKey, toggle };
}
