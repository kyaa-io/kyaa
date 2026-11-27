import { PastDrawArchiveManager } from "@/components/admin/past-draw-archive-manager";
import { NO_INDEX } from "@/seo/metadata";

export const metadata = { title: "지난 럭키드로우 등록 | kyaa Admin", robots: NO_INDEX };

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  return <PastDrawArchiveManager locale={(await searchParams).lang === "en" ? "en" : "ko"} />;
}
