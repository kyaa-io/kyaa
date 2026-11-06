"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useAppLocale } from "@/components/locale-provider";
import { useChatDockTarget } from "./chat-dock-store";

const ChatDock = dynamic(() => import("./chat-dock").then(module => module.ChatDock), { ssr: false });

/** Mounted once in the root layout so the window stays open across pages. Loads nothing until a chat is open. */
export function ChatDockHost() {
  const target = useChatDockTarget(), pathname = usePathname(), { locale } = useAppLocale();
  if (!target || pathname?.startsWith("/my/friends")) return null;
  return <ChatDock key={`${target.owner}:${target.profileId}`} locale={locale} target={target} />;
}
