"use client";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { useByUsSession } from "@/components/byus-session-provider";
import { avatarResponseSchema, type Avatar } from "../domain/avatar";
import { subscribeAvatarChanged } from "./avatar-events";

type AvatarState =
  | { status: "loading" }
  | { status: "ready"; avatar: Avatar; imageUrl: string | null }
  | { status: "error" };

type Snapshot = { key: string; state: AvatarState };
type AvatarRead = { avatar: Avatar; image: Blob | null };

/** Readers that mount together (header, menu, page) join one request in flight for the same owner and token.
 * Each reader still makes its own blob URL, so revoking one never breaks another. Refreshes after a change never join.
 * The shared request is aborted only when every reader waiting on it has left. */
type SharedAvatarRead = { promise: Promise<AvatarRead>; controller: AbortController; refs: number; settled: boolean };
const inFlightAvatarReads = new Map<string, SharedAvatarRead>();
function readAvatar(key: string, token: string, fresh: boolean, signal: AbortSignal): Promise<AvatarRead> {
  let entry = fresh ? undefined : inFlightAvatarReads.get(key);
  if (!entry) {
    const controller = new AbortController(), headers = { Authorization: `Bearer ${token}` };
    const created: SharedAvatarRead = { controller, refs: 0, settled: false, promise: undefined as unknown as Promise<AvatarRead> };
    created.promise = (async (): Promise<AvatarRead> => {
      const metadataResponse = await fetch("/api/me/avatar", { headers, cache: "no-store", signal: controller.signal });
      if (!metadataResponse.ok) throw new Error("avatar metadata unavailable");
      const { avatar } = avatarResponseSchema.parse(await metadataResponse.json());
      let image: Blob | null = null;
      if (avatar.hasImage) {
        try {
          const imageResponse = await fetch(`/api/me/avatar/image?revision=${avatar.revision}`, { headers, cache: "no-store", signal: controller.signal });
          if (imageResponse.ok) image = await imageResponse.blob();
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
        }
      }
      return { avatar, image };
    })().finally(() => { created.settled = true; if (inFlightAvatarReads.get(key) === created) inFlightAvatarReads.delete(key); });
    created.promise.catch(() => {});
    if (!fresh) inFlightAvatarReads.set(key, created);
    entry = created;
  }
  const joined = entry;
  joined.refs += 1;
  return new Promise<AvatarRead>((resolve, reject) => {
    let left = false;
    const leave = () => { if (left) return; left = true; joined.refs -= 1; };
    const onAbort = () => {
      leave();
      if (joined.refs <= 0 && !joined.settled) { joined.controller.abort(); if (inFlightAvatarReads.get(key) === joined) inFlightAvatarReads.delete(key); }
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener("abort", onAbort, { once: true });
    joined.promise.then(
      (value) => { signal.removeEventListener("abort", onAbort); leave(); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); leave(); reject(error); },
    );
  });
}

/** Loads private avatar images without ever sharing a previous owner's blob URL. */
export function useAvatar() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const session = useByUsSession();
  const sessionReady = ready && session.ready;
  const ownerId = session.ownerId ?? user?.id;
  const key = `${sessionReady}:${authenticated}:${ownerId ?? ""}:${session.generation}`;
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const refreshRef = useRef<() => void>(() => undefined);
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (!sessionReady || !authenticated || !ownerId) return;
    let active = true;
    let inFlight = false;
    let requestedAgain = false;
    let controller: AbortController | null = null;
    let currentImageUrl: string | null = null;

    const publish = (state: AvatarState) => {
      if (active) setSnapshot({ key, state });
    };
    const revokeCurrentImage = () => {
      if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
      currentImageUrl = null;
    };
    const load = async (fresh = true) => {
      if (!active) return;
      if (inFlight) {
        requestedAgain = true;
        return;
      }
      inFlight = true;
      controller = new AbortController();
      try {
        const token = await getAccessToken();
        if (!active || !token) {
          if (active) publish({ status: "error" });
          return;
        }
        const read = await readAvatar(`${ownerId}:${session.generation}:${token}`, token, fresh, controller.signal);
        if (!active) return;
        const nextImageUrl = read.image ? URL.createObjectURL(read.image) : null;
        const avatar = read.avatar;
        if (!active) {
          if (nextImageUrl) URL.revokeObjectURL(nextImageUrl);
          return;
        }
        revokeCurrentImage();
        currentImageUrl = nextImageUrl;
        publish({ status: "ready", avatar, imageUrl: nextImageUrl });
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) {
          publish({ status: "error" });
        }
      } finally {
        inFlight = false;
        if (active && requestedAgain) {
          requestedAgain = false;
          void load();
        }
      }
    };

    refreshRef.current = () => void load();
    const unsubscribe = subscribeAvatarChanged(ownerId, () => void load());
    publish({ status: "loading" });
    void load(false);
    return () => {
      active = false;
      controller?.abort();
      revokeCurrentImage();
      unsubscribe();
      refreshRef.current = () => undefined;
    };
  }, [authenticated, getAccessToken, key, ownerId, session.generation, sessionReady]);

  const state: AvatarState =
    !sessionReady || (authenticated && snapshot?.key !== key)
      ? { status: "loading" }
      : !authenticated || !ownerId
        ? { status: "error" }
        : snapshot?.state ?? { status: "loading" };

  return { state, refresh, ownerId, getAccessToken };
}
