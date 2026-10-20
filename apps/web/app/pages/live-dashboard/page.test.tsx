import { describe, expect, it, vi } from "vitest";
import { generateMetadata } from "./page";
import { publicLiveDashboardCopy } from "@/i18n/catalogs/features__public-live-dashboard";
vi.mock("@/features/public-live-dashboard/ui/public-live-dashboard", () => ({ PublicLiveDashboard: () => null }));
describe("public dashboard metadata", () => {
  it("uses the actual requested locale for localized title and canonical URL", async () => {
    const metadata = await generateMetadata({ searchParams: Promise.resolve({ locale: "ja" }) });
    expect(metadata.title).toBe(`${publicLiveDashboardCopy("ja").heading} | kyaa`);
    expect(metadata.description).toBe(publicLiveDashboardCopy("ja").intro);
    expect(metadata.alternates?.canonical).toBe("https://kyaa.io/pages/live-dashboard?locale=ja");
  });
});
