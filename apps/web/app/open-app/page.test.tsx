import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({redirect:vi.fn((href:string)=>{throw new Error(`redirect:${href}`);})}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
vi.mock("@/features/app-link/ui/app-link-fallback",()=>({AppLinkFallback:(props:unknown)=><div data-props={JSON.stringify(props)}/> }));
vi.mock("@/server/app-link/presentation",()=>({resolveAppLinkPresentation:vi.fn(async()=>({state:"generic"}))}));
import Page from "./page";

const released=()=>{vi.stubEnv("NATIVE_APP_AVAILABLE","true");vi.stubEnv("NEXT_PUBLIC_KYAA_APP_STORE_URL","https://apps.apple.com/kr/app/kyaa/id123456789");};
afterEach(()=>{vi.unstubAllEnvs();mocks.redirect.mockClear();});
describe("open-app page",()=>{
 it("sends a request that reaches the page to the web destination before the app exists",async()=>{await expect(Page({searchParams:Promise.resolve({returnTo:"/s/0123456789abcdef0123456789abcdef?locale=ko",locale:"ko"})})).rejects.toThrow("redirect:/s/0123456789abcdef0123456789abcdef?locale=ko");});
 it("keeps the screen hidden when the flag is on but no store link is set",async()=>{vi.stubEnv("NATIVE_APP_AVAILABLE","true");await expect(Page({searchParams:Promise.resolve({returnTo:"/live",locale:"ko"})})).rejects.toThrow("redirect:/live?locale=ko");});
 it("passes a preserved destination and canonical share path to the fallback",async()=>{released();const element=await Page({searchParams:Promise.resolve({returnTo:"/s/0123456789abcdef0123456789abcdef?locale=ko",locale:"ko"})});expect(element.props).toMatchObject({locale:"ko",destination:{valid:true,returnTo:"/s/0123456789abcdef0123456789abcdef?locale=ko"},sharePath:"/open-app?returnTo=%2Fs%2F0123456789abcdef0123456789abcdef%3Flocale%3Dko&locale=ko"});});
 it("cleans an unsafe destination out of the browser URL",async()=>{released();await expect(Page({searchParams:Promise.resolve({returnTo:"https://evil.test/path?access_token=secret",locale:"en"})})).rejects.toThrow("redirect:/open-app?locale=en&invalid=1");});
});
