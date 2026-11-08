"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { JjinfanChallenge } from "../domain/types";

/** The fan page server reads the creator's 찐팬 100 challenge once, so the gauge (or its absence) is in the first paint and nothing moves when the
 * client read lands. undefined = not known on the server (the gauge waits for the client read, as before). */
const Seed = createContext<{ slug: string; value: JjinfanChallenge | null } | null>(null);

export function JjinfanSeed({ slug, value, children }: { slug: string; value: JjinfanChallenge | null | undefined; children: ReactNode }) {
  return value === undefined ? <>{children}</> : <Seed.Provider value={{ slug, value }}>{children}</Seed.Provider>;
}

export function useJjinfanSeed(slug: string): JjinfanChallenge | null | undefined {
  const seed = useContext(Seed);
  return seed && seed.slug === slug ? seed.value : undefined;
}
