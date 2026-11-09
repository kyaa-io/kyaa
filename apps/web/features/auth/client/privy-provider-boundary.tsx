"use client";
// The only island-side import of the SDK's PrivyProvider (plan-b §0-6). The island Vitest project swaps exactly this
// path for a pass-through, so production and tests run the same island and mirror code.
import { PrivyProvider } from "@privy-io/react-auth";
import type { PrivyClientConfig } from "@privy-io/react-auth";
import type { ReactNode } from "react";

export function IslandPrivyProvider({ appId, config, children }: { appId: string; config: PrivyClientConfig; children: ReactNode }) {
  return <PrivyProvider appId={appId} config={config}>{children}</PrivyProvider>;
}
