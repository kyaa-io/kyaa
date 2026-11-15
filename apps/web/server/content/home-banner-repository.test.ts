import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createHomeBannerRepository } from "./home-banner-repository";

const asset = { id: "11111111-1111-4111-8111-111111111111", url: "https://cdn.test/banner.webp", width: 1440, height: 640, mimeType: "image/webp", revision: 1 };
const valid = { id: "22222222-2222-4222-8222-222222222222", kind: "announcement", celebrityId: null, title: "Title", description: "", ctaLabel: "Open", href: "/calendar?tab=live#next", alt: "Banner", desktopImage: asset, mobileImage: null };

describe("home banner public repository", () => {
  it("requests one locale and skips an invalid public DTO without cross-locale fallback", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [valid, { ...valid, id: "bad", title: "" }], error: null });
    const rows = await createHomeBannerRepository({ url: "http://local", serviceRoleKey: "key" }, { rpc } as never).list("en");
    expect(rpc).toHaveBeenCalledWith("read_published_home_banners", { p_locale: "en" });
    expect(rows).toEqual([valid]);
  });
  it("fails explicitly when the RPC is missing", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    await expect(createHomeBannerRepository({ url: "http://local", serviceRoleKey: "key" }, { rpc } as never).list("ko"))
      .rejects.toThrow("HOME_BANNER_READ_FAILED");
  });
});

it("reads group-discovery banners through the placement-specific RPC", async()=>{
 const rpc=vi.fn().mockResolvedValue({data:[{...valid,placement:'groups',category:'event'}],error:null});
 const rows=await createHomeBannerRepository({url:undefined,serviceRoleKey:undefined}, {rpc} as never).list('ko','groups');
 expect(rpc).toHaveBeenCalledWith('read_published_discovery_banners',{p_locale:'ko'});
 expect(rows[0]).toMatchObject({placement:'groups',category:'event'});
});

it("reads the 덕질 area and keeps only its own slots", async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{dukjil_mid:{...valid,placement:'dukjil_mid',category:'event'},dukjil_side:{...valid,placement:'dukjil_side',category:'ad'},home_mid:{...valid,placement:'home_mid'}},error:null});
 const slots=await createHomeBannerRepository({url:undefined,serviceRoleKey:undefined}, {rpc} as never).listSlots('ko','dukjil');
 expect(rpc).toHaveBeenCalledWith('read_published_slot_banners',{p_locale:'ko',p_area:'dukjil'});
 expect(Object.keys(slots)).toEqual(['dukjil_mid','dukjil_side']);
});
it("reads home_mid with the home slots", async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{home_mid:{...valid,placement:'home_mid',category:'ad'}},error:null});
 const slots=await createHomeBannerRepository({url:undefined,serviceRoleKey:undefined}, {rpc} as never).listSlots('en','home');
 expect(slots.home_mid?.id).toBe(valid.id);
});
