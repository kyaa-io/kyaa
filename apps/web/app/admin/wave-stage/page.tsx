import { WaveStageScreen } from "@/features/wave-stage/ui/wave-stage-screen";
import { NO_INDEX } from "@/seo/metadata";

export const metadata = { title: "팬 이벤트 무대 | kyaa Admin", robots: NO_INDEX };
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  return <WaveStageScreen locale={(await searchParams).lang === "en" ? "en" : "ko"} />;
}
