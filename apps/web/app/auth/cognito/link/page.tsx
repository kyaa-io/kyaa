import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CognitoWalletLink } from "../../../../features/auth/client/cognito-wallet-link";
import { readPublicPrivyAppleLoginPolicy } from "../../../../components/privy-apple-login-policy";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default function Page(){
  if(process.env.AUTH_PROVIDER!=="cognito")notFound();
  return <Suspense fallback={null}><CognitoWalletLink appleLoginEnabled={readPublicPrivyAppleLoginPolicy()}/></Suspense>;
}
