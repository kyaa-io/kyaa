import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supportStorageKey } from "./use-support-operation";
import { SupportScreen } from "./support-screen";
import { participationSummarySchema } from "./creator-balance";
import { APP_LOCALES } from "@/i18n/locales";
import { supportCopy } from "@/i18n/catalogs/features__support";
const auth={ready:true,authenticated:true,user:{id:"owner"},getAccessToken:async()=>"token"};
const session={ready:true,ownerId:"owner",generation:0};
vi.mock("@privy-io/react-auth",()=>({usePrivy:()=>auth}));
vi.mock("@/components/byus-session-provider",()=>({useByUsSession:()=>session}));
vi.mock("@/components/fan-shell/fan-app-shell",()=>({FanAppFrame:({children}:{children:React.ReactNode})=><div>{children}</div>,FanContentContainer:({children}:{children:React.ReactNode})=><main>{children}</main>}));
vi.mock("@/components/fan-ui/creator-avatar",()=>({CreatorAvatar:()=>null}));
const id="11111111-1111-4111-8111-111111111111";
const creator={slug:"kara",name:"KARA",image:{url:"/kara.jpg",alt:"KARA",position:"center"}};
let configured=true;
const summary={celebrityId:id,availablePoints:230,hearts:3,lifetimePoints:430,contributionPoints:300,sentHearts:2,freeDrawEntries:1};
const fetcher=vi.fn(async(url:string)=>Response.json(url.includes("participation-summary")?summary:url.includes("history")?{entries:[]}:url.includes("/raffles?")?{raffles:[]}:url.includes("/cheer-event?")?{event:null}:{celebrityId:id,fanPoints:230,freeDrawEntries:1,freeVotes:0,paidVotes:{available:0,held:0},legacyPaidDraw:0,supportVouchers:3,fanPointLedgerSequence:1,policy:configured?{status:"configured",version:"v1",freeDrawPointCost:null,freeVotePointCost:null,maxUnits:10,dailyRemaining:1,supportVoucherPointCost:100,supportVoucherAmountKrw:100}:{status:"unconfigured"}}));
beforeEach(()=>{localStorage.clear();configured=true;auth.authenticated=true;vi.stubGlobal("fetch",fetcher);fetcher.mockClear();});afterEach(()=>vi.unstubAllGlobals());
describe("support screen",()=>{
 it("shows creator balances without spending the lifetime score and confirms the actual debit",async()=>{
  render(<SupportScreen locale="ko" creators={[creator]}/>);
  await screen.findByText("300");expect(screen.getByText("누적 기여 점수")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("spinbutton",{name:"하트 보내기"}),{target:{value:"2"}});
  fireEvent.click(screen.getByRole("button",{name:"하트 보내기"}));
  expect(screen.getByText("사용 수량: 2 하트")).toBeInTheDocument();expect(screen.getAllByText("이용 후 잔액: 1 하트")).toHaveLength(2);
  expect(screen.getByText("300")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"요청 취소"}));
  fireEvent.change(screen.getByRole("spinbutton",{name:"수량"}),{target:{value:"2"}});
  expect(screen.getByRole("button",{name:"하트로 교환"})).toBeDisabled();
 });
 it("disables sending when the policy is unconfigured",async()=>{
  configured=false;render(<SupportScreen locale="ko" creators={[creator]}/>);
  await screen.findByText("하트 이용을 준비하고 있어요");expect(screen.getByRole("button",{name:"하트 보내기"})).toBeDisabled();
 });
 it("explains sign-in and does not read private resources for a guest",()=>{
  auth.authenticated=false;render(<SupportScreen locale="ko" creators={[creator]}/>);
  expect(screen.getByText(supportCopy("ko").guest)).toBeInTheDocument();expect(fetcher).not.toHaveBeenCalled();
 });
 it("integrates real lucky content and retains the owned entry route",async()=>{
  render(<SupportScreen locale="ko" creators={[creator]}/>);fireEvent.click(screen.getByRole("button",{name:"럭키드로우"}));
  expect(screen.getByRole("link",{name:"내 응모 내역"})).toHaveAttribute("href","/my/raffles?locale=ko");
  await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>url.includes("/api/celebrities/kara/raffles?locale=ko"))).toBe(true));
  expect(screen.getByRole("heading",{name:"응모권으로 참여"})).toBeInTheDocument();
 });
 it("keeps pending recovery available when wallet reads fail",async()=>{
  const pending={requestKey:id,operation:"support",input:{celebritySlug:"kara",policyVersion:"v1",units:2}};
  localStorage.setItem(supportStorageKey("owner","kara"),JSON.stringify(pending));
  const failing=vi.fn(async(url:string)=>url.endsWith("/cancel")?Response.json({status:"cancelled",requestKey:id,operation:"support"}):Response.json({error:{code:"UNAVAILABLE"}},{status:503}));
  vi.stubGlobal("fetch",failing);
  render(<SupportScreen locale="ko" creators={[creator]}/>);
  await screen.findByText(supportCopy("ko").uncertain);
  fireEvent.click(screen.getByRole("button",{name:supportCopy("ko").cancel}));
  await waitFor(()=>expect(localStorage.getItem(supportStorageKey("owner","kara"))).toBeNull());
  expect(failing.mock.calls.some(([url])=>url===`/api/me/mobile-fan-economy/requests/${id}/cancel`)).toBe(true);
 });
 it("requires all nonnegative summary fields and complete locale copy",()=>{
  expect(participationSummarySchema.safeParse({...summary,lifetimePoints:-1}).success).toBe(false);
  for(const locale of APP_LOCALES) for(const value of Object.values(supportCopy(locale))) expect(value.length).toBeGreaterThan(0);
 });
});
