import { WaveDrawManager } from "@/components/admin/wave-draw-manager";
import { NO_INDEX } from "@/seo/metadata";

export const metadata = { title: "kyaa wave draw | kyaa Admin", robots: NO_INDEX };
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = (await searchParams).lang === "en" ? "en" : "ko";
  return <WaveDrawManager locale={locale} />;
}
