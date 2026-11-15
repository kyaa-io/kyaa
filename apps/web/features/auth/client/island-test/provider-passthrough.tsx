// Island Vitest project: replaces exactly @/features/auth/client/privy-provider-boundary. The tests' SDK fakes need no
// PrivyProvider (login-page.test.tsx's factory has none), so the island and mirrors run as in production around it.
import type { ReactNode } from "react";

export function IslandPrivyProvider({ children }: { appId: string; config: unknown; children: ReactNode }) {
  return <div data-island-privy-provider="">{children}</div>;
}
