import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import { APP_LOCALES } from "@/i18n/locales";
import { communityRewardsCopy } from "@/i18n/catalogs/features__community-rewards";
import { CommunityRewards, CommunityLucky } from "./community-rewards";
const m=vi.hoisted(()=>({auth:{ready:true,authenticated:true,user:{id:"a"},getAccessToken:async()=>"token"},session:{ready:true,ownerId:"a",generation:1},resource:vi.fn(),retry:vi.fn(),invalidate:vi.fn(),notify:vi.fn()}));
vi.mock("@privy-io/react-auth",()=>({usePrivy:()=>m.auth}));
vi.mock("@/components/byus-session-provider",()=>({useByUsSession:()=>m.session}));
vi.mock("@/components/fan-ui/use-owned-fan-resource",()=>({useOwnedFanResource:m.resource}));
vi.mock("@/components/fan-ui/fan-activity-updates",()=>({notifyFanActivityUpdated:m.notify}));
vi.mock("@/features/lucky/ui/lucky-panel",()=>({LuckyPanel:()=> <p>Actual raffles</p>}));
vi.mock("@/features/benefit/ui/raffle-entry-panel",()=>({RaffleEntryPanel:()=>null}));
const creator={slug:"elina",name:"Elina"} as PublishedCelebrity;
const uuid="11111111-1111-4111-8111-111111111111";
let wallet={celebrityId:uuid,fanPoints:230,freeDrawEntries:1,freeVotes:0,paidVotes:{available:0,held:0},legacyPaidDraw:0,policy:{status:"configured",version:"v1",freeDrawPointCost:100,freeVotePointCost:null,maxUnits:10,dailyRemaining:1}};
let earning={policy:{status:"configured"},actions:[{key:"comment",pointAmount:7,status:"available",usedToday:1,dailyLimit:5,remainingToday:4,lifetimeLimit:null,lifetimeUsed:0}]};
beforeEach(()=>{
 localStorage.clear();m.auth.ready=true;m.auth.authenticated=true;m.session.ready=true;m.notify.mockClear();m.retry.mockClear();m.invalidate.mockClear();
 m.resource.mockImplementation((url:string)=>({state:{status:"ready",data:url?.includes("earning-status")?earning:wallet},refreshFailed:false,retry:m.retry,replaceData:vi.fn(),invalidate:m.invalidate}));
 vi.stubGlobal("matchMedia",()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue();
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it("uses actual policy amounts and shared post/comment limits without inventing rewards",()=>{
 render(<CommunityRewards creator={creator} locale="ko"/>);
 expect(screen.getByText("+7P")).toBeInTheDocument();expect(screen.getByText("1/5")).toBeInTheDocument();
 expect(screen.getByText(/게시물과 댓글은 하루 한도/)).toBeInTheDocument();
 expect(screen.getAllByText("준비 중")).toHaveLength(5);
 expect(screen.getByRole("link",{name:"사연·LIVE 미션"})).toHaveAttribute("href","/fandom?creator=elina&locale=ko");
});
it("keeps private earning amounts hidden during session initialization and failed refreshes",()=>{
 m.session.ready=false;const view=render(<CommunityRewards creator={creator} locale="en"/>);
 expect(screen.queryByText("+7P")).not.toBeInTheDocument();expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
 m.session.ready=true;m.resource.mockReturnValue({state:{status:"ready",data:earning},refreshFailed:true,retry:m.retry});view.rerender(<CommunityRewards creator={creator} locale="en"/>);
 expect(screen.queryByText("+7P")).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Check again"}));expect(m.retry).toHaveBeenCalled();
});
it("opens the accessible Lucky dialog and uses policy caps, a confirmation and isolated durable recovery",async()=>{
 const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>Response.json({status:"unknown"}));vi.stubGlobal("fetch",fetcher);
 const view=render(<CommunityLucky creator={creator} locale="en"/>);
 fireEvent.click(screen.getByRole("button",{name:/KYAA LUCKY DRAW/}));
 const dialog=screen.getByRole("dialog",{name:"Exchange for Lucky"});
 expect(within(dialog).getByText(/230 P/)).toBeInTheDocument();const amount=within(dialog).getByRole("spinbutton");expect(amount).toHaveAttribute("max","1");
 fireEvent.click(within(dialog).getByRole("button",{name:"Exchange for Lucky"}));
 expect(within(dialog).getByText(/−100 P/)).toBeInTheDocument();expect(within(dialog).getByText(/130 P/)).toBeInTheDocument();
 fireEvent.click(within(dialog).getByRole("button",{name:"Confirm"}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());const input=JSON.parse(fetcher.mock.calls[0][1]?.body as string);
 expect(input.target).toBe("free_draw");expect(input.units).toBe(1);
 await waitFor(()=>expect(within(dialog).getByText(/Check this request/)).toBeInTheDocument());
 fireEvent.click(within(dialog).getByRole("button",{name:"Close"}));fireEvent.click(screen.getByRole("button",{name:/KYAA LUCKY DRAW/}));
 expect(screen.getByText(/Check this request/)).toBeInTheDocument();expect(fetcher).toHaveBeenCalledOnce();
 view.unmount();
});
it("disables exchange until a real point cost is configured",()=>{
 m.resource.mockImplementation((url:string)=>({state:{status:"ready",data:{...wallet,policy:{status:"unconfigured"}}},refreshFailed:false,retry:m.retry}));
 render(<CommunityLucky creator={creator} locale="en"/>);fireEvent.click(screen.getByRole("button",{name:/KYAA LUCKY DRAW/}));
 expect(within(screen.getByRole("dialog")).getByRole("button",{name:"Exchange for Lucky"})).toBeDisabled();expect(screen.getByText("Preparing")).toBeInTheDocument();
});
it("provides complete copy for every supported locale",()=>{
 for(const locale of APP_LOCALES){const copy=communityRewardsCopy(locale);for(const value of Object.values(copy))expect(value).toBeTruthy();}
});

it("uses the same exchange-only dialog from the wallet and card, with a separate draw catalog",()=>{
 render(<CommunityLucky creator={creator} locale="en"><p>Feed</p></CommunityLucky>);
 expect(screen.getByRole("link",{name:"View draws"})).toHaveAttribute("href","/c/elina/raffles?locale=en");
 fireEvent.click(within(screen.getByTestId("community-wallet")).getByRole("button",{name:"Exchange for Lucky"}));
 expect(screen.getAllByRole("dialog")).toHaveLength(1);
 expect(within(screen.getByRole("dialog")).queryByRole("link",{name:"View draws"})).not.toBeInTheDocument();
 expect(screen.queryByText("Actual raffles")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
 fireEvent.click(screen.getByRole("button",{name:/KYAA LUCKY DRAW/}));
 expect(screen.getAllByRole("dialog")).toHaveLength(1);
});
it("hides wallet balances until session readiness and blocks exchange after failed wallet refresh",()=>{
 m.session.ready=false;const view=render(<CommunityLucky creator={creator} locale="en"/>);
 expect(screen.queryByText(/230/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:/KYAA LUCKY DRAW/}));
 expect(within(screen.getByRole("dialog")).queryByRole("spinbutton")).not.toBeInTheDocument();
 m.session.ready=true;
 m.resource.mockReturnValue({state:{status:"ready",data:wallet},refreshFailed:true,retry:m.retry});
 view.rerender(<CommunityLucky creator={creator} locale="en"/>);
 expect(screen.queryByText(/230/)).not.toBeInTheDocument();
 expect(within(screen.getByRole("dialog")).getByRole("button",{name:"Exchange for Lucky"})).toBeDisabled();
});
it("resets exchange confirmation when the session owner or generation changes",()=>{
 const view=render(<CommunityLucky creator={creator} locale="en"/>);
 fireEvent.click(screen.getByRole("button",{name:/KYAA LUCKY DRAW/}));
 fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Exchange for Lucky"}));
 expect(screen.getByRole("button",{name:"Confirm"})).toBeInTheDocument();
 m.session.generation++;
 view.rerender(<CommunityLucky creator={creator} locale="en"/>);
 expect(screen.queryByRole("button",{name:"Confirm"})).not.toBeInTheDocument();
});
it("keeps quantity stepper within actual policy limits and lets fans return from confirmation",()=>{
 render(<CommunityLucky creator={creator} locale="en"/>);
 fireEvent.click(screen.getByRole("button",{name:/KYAA LUCKY DRAW/}));
 const dialog=screen.getByRole("dialog");
 expect(within(dialog).getByRole("button",{name:"Decrease quantity"})).toBeDisabled();
 expect(within(dialog).getByRole("button",{name:"Increase quantity"})).toBeDisabled();
 fireEvent.click(within(dialog).getByRole("button",{name:"Exchange for Lucky"}));
 fireEvent.click(within(dialog).getByRole("button",{name:"Back"}));
 expect(within(dialog).queryByRole("button",{name:"Confirm"})).not.toBeInTheDocument();
 fireEvent.change(within(dialog).getByRole("spinbutton"),{target:{value:"2"}});
 expect(within(dialog).getByRole("button",{name:"Exchange for Lucky"})).toBeDisabled();
});
it("invalidates the wallet after a successful exchange and displays its refreshed balance",async()=>{
 const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{
  const input=JSON.parse(init?.body as string);
  return Response.json({requestKey:input.requestKey,celebrityId:uuid,target:"free_draw",units:1,pointsSpent:100,pointLedgerId:uuid,creditLedgerId:uuid,policyVersion:"v1",createdAt:"2026-10-20T00:00:00Z",replayed:false});
 });
 vi.stubGlobal("fetch",fetcher);
 const view=render(<CommunityLucky creator={creator} locale="en"/>);
 fireEvent.click(screen.getByRole("button",{name:/KYAA LUCKY DRAW/}));
 fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Exchange for Lucky"}));
 fireEvent.click(screen.getByRole("button",{name:"Confirm"}));
 await waitFor(()=>expect(screen.getByText("Completed")).toBeInTheDocument());
 expect(m.notify).toHaveBeenCalledWith("a");
 expect(m.invalidate).toHaveBeenCalledOnce();
 m.resource.mockReturnValue({state:{status:"ready",data:{...wallet,fanPoints:130,freeDrawEntries:2}},refreshFailed:false,retry:m.retry});
 view.rerender(<CommunityLucky creator={creator} locale="en"/>);
 expect(within(screen.getByRole("dialog")).getByText(/130 P/)).toBeInTheDocument();
});
