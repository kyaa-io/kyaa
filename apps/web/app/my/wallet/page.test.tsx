import {describe,expect,it,vi} from "vitest";
const redirect=vi.hoisted(()=>vi.fn((to:string)=>{throw new Error(`REDIRECT:${to}`);}));
vi.mock("next/navigation",()=>({redirect,notFound:()=>{throw new Error("NOT_FOUND");}}));
vi.mock("@/features/group-wallet/ui/wallet-screen",()=>({WalletScreen:()=>null}));
import Page from "./page";
describe("/my/wallet",()=>{
 it("renders the wallet history instead of redirecting to 덕질, which has no history section",async()=>{
  vi.stubEnv("KYAA_GROUPS_ENABLED","true");
  await expect(Page({searchParams:Promise.resolve({locale:"ko"})})).resolves.toBeTruthy();
  expect(redirect).not.toHaveBeenCalled();
 });
 it("still sends the old support view to 덕질",async()=>{
  vi.stubEnv("KYAA_GROUPS_ENABLED","true");
  await expect(Page({searchParams:Promise.resolve({locale:"ko",view:"support"})})).rejects.toThrow("REDIRECT:/benefits?locale=ko");
 });
 it("keeps the attendance view",async()=>{
  vi.stubEnv("KYAA_GROUPS_ENABLED","true");
  await expect(Page({searchParams:Promise.resolve({locale:"ko",view:"attendance"})})).resolves.toBeTruthy();
 });
});
