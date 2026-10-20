import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ creator: vi.fn(async () => ({slug:"kyaa-wave-fanpage",name:"Kyaa Wave"})), raffles: vi.fn(), benefit: vi.fn() }));
vi.mock("@/server/seo/public-content", () => ({loadSeoCreator:mocks.creator, loadSeoRaffles:mocks.raffles, loadSeoBenefit:mocks.benefit}));
vi.mock("next/navigation", () => ({notFound:()=>{throw Error("not-found");}}));
import List from "./page";
import Detail, { generateMetadata } from "./[benefitId]/page";
const props = () => ({params:Promise.resolve({slug:"kyaa-wave-fanpage",benefitId:"10000000-0000-4000-8000-000000000001"}),searchParams:Promise.resolve({locale:"ko"})});
beforeEach(()=>{vi.clearAllMocks();});
it("keeps Wave prize contents out of both server pages and metadata", async () => {
 const list = await List(props()), detail = await Detail(props()), metadata = await generateMetadata(props());
 expect(list.type.name).toBe("WaveRaffles"); expect(detail.type.name).toBe("WaveRaffles");
 expect(metadata.title).toBe("Kyaa Wave | kyaa");
 expect(mocks.raffles).not.toHaveBeenCalled(); expect(mocks.benefit).not.toHaveBeenCalled();
 expect(list.props).not.toHaveProperty("raffles"); expect(detail.props).not.toHaveProperty("deliveryInstructions");
});
