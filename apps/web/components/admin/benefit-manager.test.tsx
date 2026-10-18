import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthorizedBenefitManager } from "./benefit-manager";
const token = vi.hoisted(() => vi.fn(async () => "admin-token"));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ getAccessToken: token }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("lang=ko") }));
vi.mock("./use-admin-session", () => ({ useAdminSession: () => ({status:"authorized",admin:{email:"admin@example.test",role:"admin"}}) }));
vi.mock("./operations-shell", () => ({ AdminOperationsShell: ({children}: {children: React.ReactNode}) => <div>{children}</div> }));
const campaignId = "10000000-0000-4000-8000-000000000001";
const data = { benefits: [], celebrities: [], campaigns: [{id:campaignId,entrySource:"cheer",liveEventId:"10000000-0000-4000-8000-000000000002",status:"published",entryOpensAt:"2026-10-18T00:00:00Z",entryClosesAt:"2026-10-25T14:59:59Z",publicTeaser:false,revision:3,publishedAt:"2026-10-18T00:00:00Z",cancelledAt:null,drawPublishedAt:null,benefits:[],draw:null}] };
const request = vi.fn<typeof fetch>();
beforeEach(() => { request.mockReset(); vi.stubGlobal("fetch",request); });
it.each([0,2])("does not draw when empty or confirmation is declined (count %i)", async total => {
 request.mockImplementation(async (url) => Response.json(String(url).includes("/participants") ? {entrySource:"cheer",total,totalWeight:total*2,participants:[],nextOffset:null} : data));
 const confirm = vi.spyOn(window,"confirm").mockReturnValue(false);
 render(<AuthorizedBenefitManager/>);
 fireEvent.click(await screen.findByRole("button",{name:"지금 참여 마감 후 현장 추첨"}));
 await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
 await waitFor(()=>expect(screen.getByRole("button",{name:"지금 참여 마감 후 현장 추첨"})).not.toBeDisabled());
 expect(request.mock.calls.some(([url])=>String(url).endsWith("/draw"))).toBe(false);
 expect(confirm).toHaveBeenCalledTimes(total ? 1 : 0);
});
it("previews and confirms the snapshot then reuses the key after an uncertain response", async () => {
 let posts=0;
 request.mockImplementation(async (url,init) => {
  if (String(url).includes("/participants")) return Response.json({entrySource:"cheer",total:2,totalWeight:3,participants:[],nextOffset:null});
  if(init?.method==="POST") { posts++;return posts===1 ? new Response(null,{status:503}) : Response.json({drawId:"draw",candidateCount:2,winners:[],seedHash:"a".repeat(64)}); }
  return Response.json(data);
 });
 const confirm=vi.spyOn(window,"confirm").mockReturnValue(true);
 render(<AuthorizedBenefitManager/>);
 const button=await screen.findByRole("button",{name:"지금 참여 마감 후 현장 추첨"});
 fireEvent.click(button);await screen.findByText("혜택 데이터를 처리하지 못했습니다.");
 fireEvent.click(button);await waitFor(()=>expect(posts).toBe(2));
 const bodies=request.mock.calls.filter(([,init])=>init?.method==="POST").map(([,init])=>JSON.parse(String(init?.body)));
 expect(bodies[0]).toMatchObject({closeEntriesNow:true,expectedRevision:3});expect(bodies[1]).toEqual(bodies[0]);
 expect(confirm).toHaveBeenCalledWith(expect.stringContaining("현재 참여자 2명 · 총 추첨 가중치 3"));
});
