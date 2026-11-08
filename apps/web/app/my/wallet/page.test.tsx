import {describe,expect,it,vi} from "vitest";
const redirect=vi.hoisted(()=>vi.fn((to:string)=>{throw new Error(`REDIRECT:${to}`);}));
vi.mock("next/navigation",()=>({redirect,notFound:()=>{throw new Error("NOT_FOUND");}}));
vi.mock("@/features/group-wallet/ui/wallet-screen",()=>({WalletScreen:()=>null}));
import Page from "./page";
describe("/my/wallet",()=>{
 it("moves the wallet page to the history on 덕질",async()=>{
  vi.stubEnv("KYAA_GROUPS_ENABLED","true");
  await expect(Page({searchParams:Promise.resolve({locale:"ko"})})).rejects.toThrow("REDIRECT:/benefits?tab=history&locale=ko");
 });
 it("keeps the attendance view",async()=>{
  vi.stubEnv("KYAA_GROUPS_ENABLED","true");
  await expect(Page({searchParams:Promise.resolve({locale:"ko",view:"attendance"})})).resolves.toBeTruthy();
 });
});
