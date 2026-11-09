"use client";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { useGroupRequest } from "@/features/groups/ui/use-group-resource";

export const MAX_EXCHANGE_UNITS = 1000;
const pendingSchema = z.object({ operation: z.literal("exchange"), requestKey: z.uuid(), policyVersion: z.literal("group-wallet-v1"), target: z.literal("ticket"), units: z.number().int().min(1).max(MAX_EXCHANGE_UNITS), adSessionId: z.uuid() });
export type PendingExchange = z.infer<typeof pendingSchema>;

/** The tile and its unmounted sheet share the current owner's validated saved request. */
export function usePendingExchange() {
  const { ownerKey } = useGroupRequest();
  const storageKey = `kyaa-wallet-pending:${ownerKey.split(":").slice(0, -1).join(":")}`;
  const [saved, setSaved] = useState<{ key: string; pending: PendingExchange | null } | null>(null);
  useEffect(() => {
    let pending: PendingExchange | null = null;
    try { const stored = sessionStorage.getItem(storageKey); pending = stored ? pendingSchema.parse(JSON.parse(stored)) : null; } catch { /* invalid or unavailable storage */ }
    setSaved({ key: storageKey, pending });
  }, [storageKey]);
  const setPending = useCallback((pending: PendingExchange | null) => setSaved({ key: storageKey, pending }), [storageKey]);
  return { storageKey, storageReady: saved?.key === storageKey, pending: saved?.key === storageKey ? saved.pending : null, setPending };
}
export type PendingExchangeState = ReturnType<typeof usePendingExchange>;
