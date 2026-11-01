import { notFound } from "next/navigation";
import { GroupCapsuleManager } from "@/components/admin/group-capsule-manager";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
 if (process.env.KYAA_GROUPS_ENABLED !== "true") notFound();
 return <GroupCapsuleManager locale={(await searchParams).lang === "en" ? "en" : "ko"} />;
}
