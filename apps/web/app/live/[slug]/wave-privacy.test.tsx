import { expect, it, vi } from "vitest";
const load = vi.hoisted(() => vi.fn(async () => ({ live: { celebrity: {slug:"kyaa-wave-fanpage"}, title:"PRIVATE LIVE", description:"PRIVATE DETAILS" } })));
vi.mock("@/server/seo/public-content", () => ({loadSeoLive:load}));
vi.mock("next/navigation", () => ({notFound:()=>{throw Error("not-found");}}));
import Page, {generateMetadata} from "./page";
it("does not serialize Wave LIVE details into the page or metadata", async () => {
 const props = {params:Promise.resolve({slug:"wave-live"}), searchParams:Promise.resolve({locale:"ko"})};
 const page = await Page(props), metadata = await generateMetadata(props);
 expect(page.type.name).toBe("WaveAccessBoundary");
 expect(page.props.children.props).not.toHaveProperty("initialData");
 expect(JSON.stringify(metadata)).not.toContain("PRIVATE");
 expect(metadata.title).toBe("Kyaa Wave | kyaa");
});
