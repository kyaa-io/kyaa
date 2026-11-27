import { OperatorHome } from "@/components/operator/operator-shell";

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string; channel?: string }> }) {
  const { lang, channel } = await searchParams;
  return <OperatorHome locale={lang === "en" ? "en" : "ko"} channelId={channel} />;
}
