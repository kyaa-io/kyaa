"use client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { cancelWaveUpload, uploadWaveMedia, validWaveFiles, type WaveUpload } from "./wave-media-upload";

export function useWaveMediaUpload(purpose: "wave_album" | "wave_post", photoLimit = 30) {
  const auth = usePrivy(), session = useByUsSession();
  const ownerKey = `${auth.authenticated}:${session.ownerId ?? auth.user?.id}:${session.generation}`;
  const [snapshot, setSnapshot] = useState<{ key: string; items: WaveUpload[] }>({ key: ownerKey, items: [] });
  const [invalid, setInvalid] = useState(false);
  const pending = useRef(new Map<string, AbortController>());
  const activeOwner = useRef<string | null>(ownerKey);
  const removed = useRef(new Set<string>());
  const provider = useRef(auth.getAccessToken), getAccessToken = auth.getAccessToken;
  useLayoutEffect(() => { provider.current = getAccessToken; }, [getAccessToken]);
  const tasks = useRef(new Map<string, WaveUpload>());
  const discard = useCallback((task: WaveUpload) => { void cancelWaveUpload(task, () => provider.current()).catch(() => { /* Leaving the screen must remain possible during network loss. */ }); }, []);
  useLayoutEffect(() => { activeOwner.current = ownerKey; const requests = pending.current, currentTasks = tasks.current; return () => { activeOwner.current = null; requests.forEach(controller => controller.abort()); requests.clear(); currentTasks.forEach(discard); currentTasks.clear(); }; }, [ownerKey, discard]);
  const items = snapshot.key === ownerKey ? snapshot.items : [];
  function update(task: WaveUpload) { setSnapshot(current => current.key === ownerKey ? { ...current, items: current.items.map(item => item.key === task.key ? task : item) } : current); }
  async function run(task: WaveUpload) {
    if (activeOwner.current !== ownerKey || removed.current.has(task.key) || pending.current.has(task.key) || !auth.authenticated || !session.ready) return;
    const controller = new AbortController(); pending.current.set(task.key, controller);
    task.failed = false; update(task);
    try { await uploadWaveMedia(task, purpose, () => provider.current(), controller.signal); }
    catch { if (!controller.signal.aborted) task.failed = true; }
    finally { pending.current.delete(task.key); if (controller.signal.aborted) discard(task); else update(task); }
  }
  function add(files: File[]) {
    if ((purpose === "wave_post" && files.some(file => !file.type.startsWith("video/"))) || !validWaveFiles(files, items, photoLimit)) { setInvalid(true); return; }
    setInvalid(false);
    const added = files.map(file => ({ key: crypto.randomUUID(), file }));
    added.forEach(task => tasks.current.set(task.key, task));
    setSnapshot({ key: ownerKey, items: [...items, ...added] });
    void (async () => { for (const task of added) await run(task); })();
  }
  function remove(key: string) { removed.current.add(key); pending.current.get(key)?.abort(); pending.current.delete(key); const task = tasks.current.get(key); if (task) discard(task); tasks.current.delete(key); setSnapshot(current => ({ ...current, items: current.items.filter(item => item.key !== key) })); }
  return { items, invalid, add, remove, retry: (task: WaveUpload) => void run(task), ready: items.length > 0 && items.every(item => item.media?.state === "ready"), busy: items.some(item => !item.failed && item.media?.state !== "ready") };
}
