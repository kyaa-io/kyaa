import { Suspense } from "react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const {redirect}=vi.hoisted(()=>({redirect:vi.fn((href:string)=>{throw new Error(`redirect:${href}`);})}));
vi.mock("next/navigation",()=>({redirect}));
vi.mock("../../../../features/auth/client/cognito-wallet-link",()=>({CognitoWalletLink:()=>null}));
import Page from "./page";
import { CognitoWalletLink } from "../../../../features/auth/client/cognito-wallet-link";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it("redirects retired linking to the current login while preserving safe locale and destination",async()=>{
 vi.stubEnv("AUTH_PROVIDER","privy");
 await expect(Page({searchParams:Promise.resolve({returnTo:"/passport?tab=stamps",locale:"ja",code:"secret",state:"secret"})})).rejects.toThrow("redirect:/login?returnTo=%2Fpassport%3Ftab%3Dstamps&locale=ja");
});
it.each(["https://evil.test","//evil.test","/auth/cognito/link?returnTo=/passport","/api/auth/cognito/start"])("does not return to unsafe or retired path %s",async returnTo=>{
 vi.stubEnv("AUTH_PROVIDER","privy");
 await expect(Page({searchParams:Promise.resolve({returnTo,locale:"invalid"})})).rejects.toThrow("redirect:/login?returnTo=%2F&locale=ko");
});
it("ignores duplicate query values when retiring linking",async()=>{
 vi.stubEnv("AUTH_PROVIDER","privy");
 await expect(Page({searchParams:Promise.resolve({returnTo:["/passport","/my"],locale:["ja","en"]})})).rejects.toThrow("redirect:/login?returnTo=%2F&locale=ko");
});
it("preserves active Cognito linking for rollback",async()=>{
 vi.stubEnv("AUTH_PROVIDER","cognito");
 const page=await Page({searchParams:Promise.resolve({})});
 expect(page.type).toBe(Suspense);expect(page.props.children.type).toBe(CognitoWalletLink);expect(redirect).not.toHaveBeenCalled();
});
