"use client";
// The app's auth root. Cognito mode (PRIVY-EXIT-0005): kyaa's own Cognito-backed server session, no third-party auth
// SDK. Privy mode (AUTH_PROVIDER=privy, PRIVY-RESTORE-1115): the Privy island and bridge, loaded as a separate chunk
// so Cognito pages never download it. Both wrap the avatar bridge and the session transition owner.
import dynamic from "next/dynamic";
import { useEffect, type ReactNode } from "react";
import { AvatarSessionBridge } from "@/components/avatar-session-bridge";
import { ByUsSessionProvider } from "@/components/byus-session-provider";
import { installResourceWriteWatch } from "@/components/fan-ui/resource-cache";
import { CognitoAuthProvider } from "./cognito-auth";

const PrivyAuthRoot = dynamic(() => import("./privy-root.island"));

export function AuthRoot({ authProvider = "cognito", privyAppId = "", appleLoginEnabled = false, testAccountLoginEnabled = false, children }: {
  authProvider?: "privy" | "cognito";
  privyAppId?: string;
  appleLoginEnabled?: boolean;
  testAccountLoginEnabled?: boolean;
  children: ReactNode;
}) {
  useEffect(() => installResourceWriteWatch(), []);
  if (authProvider === "privy") {
    return <PrivyAuthRoot appId={privyAppId} appleLoginEnabled={appleLoginEnabled} testAccountLoginEnabled={testAccountLoginEnabled}>
      <ByUsSessionProvider>{children}</ByUsSessionProvider>
    </PrivyAuthRoot>;
  }
  return <CognitoAuthProvider><AvatarSessionBridge><ByUsSessionProvider>{children}</ByUsSessionProvider></AvatarSessionBridge></CognitoAuthProvider>;
}
