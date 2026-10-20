import { WaveStageScreen } from "@/features/wave-stage/ui/wave-stage-screen";
import { NO_INDEX } from "@/seo/metadata";

export const metadata = { title: "KYAA WAVE Stage | kyaa Admin", robots: NO_INDEX };
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  return <WaveStageScreen locale={(await searchParams).lang === "en" ? "en" : "ko"} />;
}
