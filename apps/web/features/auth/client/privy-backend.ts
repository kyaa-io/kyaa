// The one place app code reaches Privy's React hooks (PERF-r8 B, step 1a: the direct backend). Each hook calls the
// SDK hook of the same name inside the existing PrivyProvider tree (components/privy-provider.tsx keeps that tree).
// The SDK is read through the namespace at call time, so vi.mock("@privy-io/react-auth") and the e2e harness aliases still
// decide the result, and a name a fake leaves out fails only where it is called. Never add fallbacks for missing names.
import * as sdk from "@privy-io/react-auth";

export type { User } from "@privy-io/react-auth";

export const usePrivy: typeof sdk.usePrivy = () => sdk.usePrivy();
export const useUser: typeof sdk.useUser = () => sdk.useUser();
export const useCreateWallet: typeof sdk.useCreateWallet = (...args) => sdk.useCreateWallet(...args);
export const useLogin: typeof sdk.useLogin = (...args) => sdk.useLogin(...args);
export const useLoginWithOAuth: typeof sdk.useLoginWithOAuth = (...args) => sdk.useLoginWithOAuth(...args);
export const useLinkWithOAuth: typeof sdk.useLinkWithOAuth = (...args) => sdk.useLinkWithOAuth(...args);
export const useLinkEmail: typeof sdk.useLinkEmail = (...args) => sdk.useLinkEmail(...args);
export const useLinkJwtAccount: typeof sdk.useLinkJwtAccount = (...args) => sdk.useLinkJwtAccount(...args);
export const useOAuthTokens: typeof sdk.useOAuthTokens = (...args) => sdk.useOAuthTokens(...args);
export const useSubscribeToJwtAuthWithFlag: typeof sdk.useSubscribeToJwtAuthWithFlag = (...args) => sdk.useSubscribeToJwtAuthWithFlag(...args);
