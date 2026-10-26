import { redirect } from "next/navigation";
import type { Route } from "next";
import { sanitizeLocale, sanitizeReturnTo } from "../../../../components/login-intent";
import { Suspense } from "react";
import { CognitoWalletLink } from "../../../../features/auth/client/cognito-wallet-link";
import { readPublicPrivyAppleLoginPolicy } from "../../../../components/privy-apple-login-policy";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  if(process.env.AUTH_PROVIDER!=="cognito"){
    const query=await searchParams;
    const returnTo=sanitizeReturnTo(typeof query.returnTo==="string"?query.returnTo:undefined);
    const params=new URLSearchParams({returnTo:/^\/(?:api\/)?auth\/cognito(?:[/?#]|$)/i.test(returnTo)?"/":returnTo,locale:sanitizeLocale(typeof query.locale==="string"?query.locale:undefined)});
    redirect(`/login?${params}` as Route);
  }
  return <Suspense fallback={null}><CognitoWalletLink appleLoginEnabled={readPublicPrivyAppleLoginPolicy()}/></Suspense>;
}
