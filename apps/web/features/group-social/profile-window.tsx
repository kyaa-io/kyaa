"use client";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { z } from "zod";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useGroupRequest } from "@/features/groups/ui/use-group-resource";
import type { ProfileModalPerson } from "./profile-modal";
import { refKey, type ContentRef } from "./profile-ref";
import styles from "./profile-modal.module.css";

/** One profile window for the whole app, opened from any author name (B6). Mounted by ProfileWindowHost in the root layout. */
let current: ProfileModalPerson | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
export function openProfileWindow(person: ProfileModalPerson) { current = person; emit(); }
export function closeProfileWindow() { current = null; emit(); }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useProfileWindowTarget = () => useSyncExternalStore(subscribe, () => current, () => null);

/** Asks which authors may be opened, once per screen-full: names that register within one tick share a request. */
type Batch = { owner: string; request: (url: string, init?: RequestInit) => Promise<unknown> };
const openAnswers = new Map<string, boolean>(), waiting = new Map<string, Set<() => void>>();
let queued: { batch: Batch; keys: Set<string> } | null = null;
const encodeRefs = (refs: unknown) => btoa(JSON.stringify(refs)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const openSchema = z.object({ open: z.array(z.object({ kind: z.string(), id: z.uuid() })) });
function ask(batch: Batch, key: string, done: () => void) {
  const scoped = `${batch.owner}|${key}`;
  // Already answered: the render read it, so calling back would only re-render forever.
  if (openAnswers.has(scoped)) return;
  const callbacks = waiting.get(scoped) ?? new Set(); callbacks.add(done); waiting.set(scoped, callbacks);
  if (callbacks.size > 1) return;
  if (!queued || queued.batch.owner !== batch.owner) {
    queued = { batch, keys: new Set() };
    const mine = queued;
    queueMicrotask(() => { if (queued === mine) queued = null; void flush(mine); });
  }
  queued.keys.add(key);
}
async function flush({ batch, keys }: { batch: Batch; keys: Set<string> }) {
  const all = [...keys];
  for (let start = 0; start < all.length; start += 50) {
    const part = all.slice(start, start + 50);
    let open = new Set<string>();
    try { open = new Set(openSchema.parse(await batch.request(`/api/profiles/refs-open?refs=${encodeRefs(part.map(key => { const [kind, id] = key.split(":"); return { kind, id }; }))}`)).open.map(item => `${item.kind}:${item.id}`)); }
    catch { /* Unknown stays plain text. */ }
    for (const key of part) {
      const scoped = `${batch.owner}|${key}`;
      openAnswers.set(scoped, open.has(key));
      for (const callback of waiting.get(scoped) ?? []) callback();
      waiting.delete(scoped);
    }
  }
}

/** Whether this author may be opened by this viewer. False until the server says so, and when it cannot be asked. */
export function useAuthorOpen(ref: ContentRef | null) {
  const { request, ready, ownerKey } = useGroupRequest();
  const key = ref ? refKey(ref) : null;
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!ready || !key) return;
    let live = true;
    ask({ owner: ownerKey, request }, key, () => { if (live) rerender(value => value + 1); });
    return () => { live = false; };
  }, [key, ownerKey, ready, request]);
  return key ? openAnswers.get(`${ownerKey}|${key}`) ?? false : false;
}

/** An author's name: a button that opens their profile when allowed, plain text otherwise (anonymous, gone, sanctioned, blocked, proof posts). */
export function ProfileAuthor({ contentRef, nickname, avatarUrl, children, className }: { contentRef: ContentRef | null; nickname: string; avatarUrl: string | null; children: ReactNode; className?: string }) {
  const open = useAuthorOpen(contentRef);
  if (!open || !contentRef) return <>{children}</>;
  return <FanAction variant="text" className={`${styles.authorButton} ${className ?? ""}`} onClick={event => { event.preventDefault(); event.stopPropagation(); openProfileWindow({ ref: contentRef, nickname, avatarUrl }); }}>{children}</FanAction>;
}
