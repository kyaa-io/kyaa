"use client";
// The only island-side caller of Privy's React hooks (plan-b §0-7). Each mirror calls one SDK hook inside the island's
// PrivyProvider with the leasing app component's arguments and publishes what it returned, unchanged.
import * as sdk from "@privy-io/react-auth";
import { memo, useLayoutEffect, useSyncExternalStore } from "react";
import { useIslandStore, type HookKind, type PrivyIslandStore, type SharedKind } from "./privy-backend.island";

type LeasedKind = Exclude<HookKind, SharedKind>;
type Call = (args: unknown[]) => unknown;
// Static access per name (tree shaking; a fake that leaves a name out fails only when that name is leased).
const LEASED: Record<LeasedKind, Call> = {
  useCreateWallet: args => sdk.useCreateWallet(...(args as Parameters<typeof sdk.useCreateWallet>)),
  useLogin: args => sdk.useLogin(...(args as Parameters<typeof sdk.useLogin>)),
  useLoginWithOAuth: args => sdk.useLoginWithOAuth(...(args as Parameters<typeof sdk.useLoginWithOAuth>)),
  useLinkWithOAuth: args => sdk.useLinkWithOAuth(...(args as Parameters<typeof sdk.useLinkWithOAuth>)),
  useLinkEmail: args => sdk.useLinkEmail(...(args as Parameters<typeof sdk.useLinkEmail>)),
  useLinkJwtAccount: args => sdk.useLinkJwtAccount(...(args as Parameters<typeof sdk.useLinkJwtAccount>)),
  useOAuthTokens: args => sdk.useOAuthTokens(...(args as Parameters<typeof sdk.useOAuthTokens>)),
  useSubscribeToJwtAuthWithFlag: args => sdk.useSubscribeToJwtAuthWithFlag(...(args as Parameters<typeof sdk.useSubscribeToJwtAuthWithFlag>)),
};

/** Test devices bump the store tick after app commits (plan-b §7.2); the production store never bumps it. */
function useTick(store: PrivyIslandStore) {
  useSyncExternalStore(store.subscribeTick, store.getTick, store.getTick);
}

const SharedPrivyMirror = memo(function SharedPrivyMirror({ generation }: { generation: number }) {
  const store = useIslandStore();
  useTick(store);
  const result = sdk.usePrivy();
  useLayoutEffect(() => { store.publishShared("usePrivy", generation, result); });
  return null;
});

const SharedUserMirror = memo(function SharedUserMirror({ generation }: { generation: number }) {
  const store = useIslandStore();
  useTick(store);
  const result = sdk.useUser();
  useLayoutEffect(() => { store.publishShared("useUser", generation, result); });
  return null;
});

const LeaseMirror = memo(function LeaseMirror({ id, kind, generation, argsVersion }: { id: string; kind: LeasedKind; generation: number; argsVersion: number }) {
  const store = useIslandStore();
  useTick(store);
  void argsVersion; // A new version re-renders the mirror with the new value arguments.
  const result = LEASED[kind](store.mirrorArgs(id));
  useLayoutEffect(() => { store.publish(id, generation, result); });
  return null;
});

/** One mirror per lease (key = lease id, so a StrictMode re-register keeps the same SDK hook instance). */
export function PrivyMirrors() {
  const store = useIslandStore();
  const snapshot = useSyncExternalStore(store.subscribeIsland, store.getIslandSnapshot, store.getIslandSnapshot);
  return <>
    {snapshot.shared.includes("usePrivy") && <SharedPrivyMirror generation={snapshot.sharedGeneration.usePrivy} />}
    {snapshot.shared.includes("useUser") && <SharedUserMirror generation={snapshot.sharedGeneration.useUser} />}
    {snapshot.leases.map(entry => <LeaseMirror key={entry.id} id={entry.id} kind={entry.kind as LeasedKind} generation={entry.generation} argsVersion={entry.argsVersion} />)}
  </>;
}
