import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({redirect:vi.fn((href:string)=>{throw new Error(`redirect:${href}`);})}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
vi.mock("@/features/app-link/ui/app-link-fallback",()=>({AppLinkFallback:(props:unknown)=><div data-props={JSON.stringify(props)}/> }));
vi.mock("@/server/app-link/presentation",()=>({resolveAppLinkPresentation:vi.fn(async()=>({state:"generic"}))}));
import Page from "./page";

describe("open-app page",()=>{
 it("passes a preserved destination and canonical share path to the fallback",async()=>{const element=await Page({searchParams:Promise.resolve({returnTo:"/s/0123456789abcdef0123456789abcdef?locale=ko",locale:"ko"})});expect(element.props).toMatchObject({locale:"ko",destination:{valid:true,returnTo:"/s/0123456789abcdef0123456789abcdef?locale=ko"},sharePath:"/open-app?returnTo=%2Fs%2F0123456789abcdef0123456789abcdef%3Flocale%3Dko&locale=ko"});});
 it("cleans an unsafe destination out of the browser URL",async()=>{await expect(Page({searchParams:Promise.resolve({returnTo:"https://evil.test/path?access_token=secret",locale:"en"})})).rejects.toThrow("redirect:/open-app?locale=en&invalid=1");});
});
