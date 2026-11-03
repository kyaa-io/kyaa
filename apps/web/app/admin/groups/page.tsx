import { notFound } from "next/navigation";
import { GroupApplicationManager } from "@/components/admin/group-application-manager";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
 if (process.env.KYAA_GROUPS_ENABLED !== "true") notFound();
 return <GroupApplicationManager locale={(await searchParams).lang === "en" ? "en" : "ko"} />;
}
