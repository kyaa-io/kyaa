import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthorizedBenefitManager } from "./benefit-manager";
const token = vi.hoisted(() => vi.fn(async () => "admin-token"));
const routeLocale = vi.hoisted(() => ({ value: "ko" }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ getAccessToken: token }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(`lang=${routeLocale.value}`) }));
vi.mock("./use-admin-session", () => ({ useAdminSession: () => ({status:"authorized",admin:{email:"admin@example.test",role:"admin"}}) }));
vi.mock("./operations-shell", () => ({ AdminOperationsShell: ({children}: {children: React.ReactNode}) => <div>{children}</div> }));
const campaignId = "10000000-0000-4000-8000-000000000001";
const data = { benefits: [], celebrities: [], campaigns: [{id:campaignId,entrySource:"cheer",liveEventId:"10000000-0000-4000-8000-000000000002",status:"published",entryOpensAt:"2026-10-18T00:00:00Z",entryClosesAt:"2026-10-25T14:59:59Z",publicTeaser:false,revision:3,publishedAt:"2026-10-18T00:00:00Z",cancelledAt:null,drawPublishedAt:null,benefits:[],draw:null}] };
const request = vi.fn<typeof fetch>();
beforeEach(() => { request.mockReset(); routeLocale.value = "ko"; vi.stubGlobal("fetch",request); });
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
it.each(["ko", "en"] as const)("identifies LIVE campaigns by creator in the list, search, and draw confirmation (%s)", async locale => {
 routeLocale.value = locale;
 const secondCampaignId = "10000000-0000-4000-8000-000000000003";
 const prizeIds = ["20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000002"];
 const celebrityIds = ["30000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000002"];
 const campaigns = [campaignId, secondCampaignId].map((id, index) => ({ ...data.campaigns[0], id, liveEventId: `40000000-0000-4000-8000-00000000000${index + 1}`, benefits: [{ benefitId: prizeIds[index], priority: 1, perFanTicketLimit: null, winnerQuantity: 1, fulfillmentMethod: "digital", teaserImageUrl: null }] }));
 const names = [{ ko: "창하", en: "Changha" }, { ko: "위나", en: "We;Na" }];
 const overview = { campaigns, celebrities: names.map((name, index) => ({ id: celebrityIds[index], nameKo: name.ko, nameEn: name.en, status: "published" })), benefits: prizeIds.map((id, index) => ({ id, slug: `prize-${index}`, celebrityId: celebrityIds[index], publicationStatus: "published", localizations: { ko: { title: "커피 쿠폰" }, en: { title: "Coffee coupon" } } })) };
 request.mockImplementation(async url => Response.json(String(url).includes("/participants") ? { entrySource: "cheer", total: 2, totalWeight: 3, participants: [], nextOffset: null } : overview));
 const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
 render(<AuthorizedBenefitManager />);
 const firstLabel = new RegExp(`^LIVE · ${names[0][locale]} ·`), secondLabel = new RegExp(`^LIVE · ${names[1][locale]} ·`);
 expect(await screen.findByRole("button", { name: firstLabel })).toHaveTextContent(campaigns[0].liveEventId);
 expect(screen.getByRole("button", { name: secondLabel })).toHaveTextContent(campaigns[1].liveEventId);
 fireEvent.change(screen.getAllByRole("searchbox")[0], { target: { value: names[1][locale] } });
 expect(screen.queryByRole("button", { name: firstLabel })).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: locale === "ko" ? "지금 참여 마감 후 현장 추첨" : "Close entries now and draw" }));
 await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining(`LIVE · ${names[1][locale]} · ${campaigns[1].liveEventId}`)));
 expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});
