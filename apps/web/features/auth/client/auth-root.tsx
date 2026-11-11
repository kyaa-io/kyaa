"use client";
// The app's auth root (PRIVY-EXIT-0005): kyaa's own Cognito-backed server session, the avatar bridge and the session
// transition owner. No third-party auth SDK is mounted.
import { useEffect, type ReactNode } from "react";
import { AvatarSessionBridge } from "@/components/avatar-session-bridge";
import { ByUsSessionProvider } from "@/components/byus-session-provider";
import { installResourceWriteWatch } from "@/components/fan-ui/resource-cache";
import { CognitoAuthProvider } from "./cognito-auth";

export function AuthRoot({ children }: { children: ReactNode }) {
  useEffect(() => installResourceWriteWatch(), []);
  return <CognitoAuthProvider><AvatarSessionBridge><ByUsSessionProvider>{children}</ByUsSessionProvider></AvatarSessionBridge></CognitoAuthProvider>;
}
