import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find:vi.fn(), read:vi.fn() }));
vi.mock("@/server/wave/access", () => ({withWaveAccess:(handler:unknown)=>handler}));
vi.mock("@/server/content/published-content-repository", () => ({createPublishedContentRepositoryFromEnvironment:()=>({findBySlug:mocks.find})}));
vi.mock("@/server/chzzk/community", () => ({readChzzkPost:mocks.read}));
import { GET } from "./route";
const channel = "0a3f97086cb81d3360c69fdf5d020045";
const get = (postId="123") => GET(new Request(`https://kyaa.test/api/celebrities/kyaa-wave-fanpage/chzzk/${postId}`), {params:Promise.resolve({slug:"kyaa-wave-fanpage",postId})});
beforeEach(()=>{vi.resetAllMocks();});
it("rejects invalid IDs and creators without an official channel", async () => {
 expect((await get("bad")).status).toBe(404); expect(mocks.find).not.toHaveBeenCalled();
 mocks.find.mockResolvedValue({socialLinks:[]}); expect((await get()).status).toBe(404); expect(mocks.read).not.toHaveBeenCalled();
});
it("reads only the creator's channel and disables response caching", async () => {
 mocks.find.mockResolvedValue({socialLinks:[{platform:"chzzk",url:`https://chzzk.naver.com/${channel}`}]});
 mocks.read.mockResolvedValue({id:"123",text:"original",date:"2026-10-22",images:[]});
 const result = await get(); expect(result.status).toBe(200); expect(mocks.read).toHaveBeenCalledWith("123",undefined,channel);
 expect(result.headers.get("cache-control")).toBe("private, no-store");
});
it("fails closed when the upstream read fails", async () => {
 mocks.find.mockRejectedValue(new Error("offline")); expect((await get()).status).toBe(503);
});
