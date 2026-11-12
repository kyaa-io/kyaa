import { notFound, permanentRedirect } from "next/navigation";
import type { Route } from "next";
import { isCreatorHandle } from "@/features/creator/domain/creator-navigation";

export default async function CommunityPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams;
  const slug = values.creator;
  if (slug !== undefined && (typeof slug !== "string" || !isCreatorHandle(slug))) notFound();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (key === "creator" || key === "tab") continue;
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const tabs: Record<string, string> = { posts: "board", board: "board", fans: "leaderboard", members: "leaderboard", certifications: "certifications" };
  const tab = typeof values.tab === "string" ? tabs[values.tab] : undefined;
  if (slug && tab) query.set("tab", tab);
  permanentRedirect(`${slug ? `/c/${encodeURIComponent(slug)}` : "/pages/groups"}${query.size ? `?${query}` : ""}` as Route);
}
