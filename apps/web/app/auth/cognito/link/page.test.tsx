import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const {redirect}=vi.hoisted(()=>({redirect:vi.fn((href:string)=>{throw new Error(`redirect:${href}`);})}));
vi.mock("next/navigation",()=>({redirect}));
import Page from "./page";
afterEach(()=>{vi.clearAllMocks();});
it("redirects the retired linking page to login while preserving safe locale and destination",async()=>{
 await expect(Page({searchParams:Promise.resolve({returnTo:"/passport?tab=stamps",locale:"ja",code:"secret",state:"secret"})})).rejects.toThrow("redirect:/login?returnTo=%2Fpassport%3Ftab%3Dstamps&locale=ja");
});
it.each(["https://evil.test","//evil.test","/auth/cognito/link?returnTo=/passport","/api/auth/cognito/start"])("does not return to unsafe or retired path %s",async returnTo=>{
 await expect(Page({searchParams:Promise.resolve({returnTo,locale:"invalid"})})).rejects.toThrow("redirect:/login?returnTo=%2F&locale=ko");
});
it("ignores duplicate query values",async()=>{
 await expect(Page({searchParams:Promise.resolve({returnTo:["/passport","/my"],locale:["ja","en"]})})).rejects.toThrow("redirect:/login?returnTo=%2F&locale=ko");
});
