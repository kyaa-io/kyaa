import { redirect } from "next/navigation";
import type { Route } from "next";
import { sanitizeLocale, sanitizeReturnTo } from "../../../../components/login-intent";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
// The Privy wallet-link step is retired (PRIVY-EXIT-0005): sign-in links or creates the member on the server callback.
// Old bookmarks and open tabs continue to the normal login page.
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const query=await searchParams;
  const returnTo=sanitizeReturnTo(typeof query.returnTo==="string"?query.returnTo:undefined);
  const params=new URLSearchParams({returnTo:/^\/(?:api\/)?auth\/cognito(?:[/?#]|$)/i.test(returnTo)?"/":returnTo,locale:sanitizeLocale(typeof query.locale==="string"?query.locale:undefined)});
  redirect(`/login?${params}` as Route);
}
