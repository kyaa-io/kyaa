import { RunmusicManager } from "@/components/admin/runmusic-manager";
export default async function RunmusicAdminPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <RunmusicManager locale={lang === "en" ? "en" : "ko"} />;
}
