"use client";
import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useGroupRequest } from "@/features/groups/ui/use-group-resource";
import { waveFriendsCopy } from "@/i18n/catalogs/features__fanpage__wave-friends";
import type { AppLocale } from "@/i18n/locales";
import { socialCopy } from "./copy";

const profile = z.object({ profile: z.object({ id: z.uuid() }), isSelf: z.boolean(), capabilities: z.object({ canRequestDm: z.boolean() }), dm: z.object({ conversationId: z.uuid().nullable() }) });
export function MemberDmEntry({ profileId, nickname, locale }: { profileId: string; nickname: string; locale: AppLocale }) {
 const auth = useGroupRequest();
 return <MemberDmAction key={auth.ownerKey} auth={auth} profileId={profileId} nickname={nickname} locale={locale} />;
}
function MemberDmAction({ auth, profileId, nickname, locale }: { auth: ReturnType<typeof useGroupRequest>; profileId: string; nickname: string; locale: AppLocale }) {
 const router = useRouter(), t = waveFriendsCopy(locale);
 const [pending, setPending] = useState(false), [error, setError] = useState<"unavailable" | "failed">();
 const mounted = useRef(true);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
 if (!auth.ready || !auth.authenticated) return null;
 async function open() {
  if (pending) return;
  setPending(true); setError(undefined);
  try {
   const value = profile.parse(await auth.request(`/api/me/social/profiles/${encodeURIComponent(profileId)}?locale=${locale === "ko" ? "ko" : "en"}`));
   if (!mounted.current) return;
   if (value.profile.id !== profileId || value.isSelf || (!value.capabilities.canRequestDm && !value.dm.conversationId)) { setError("unavailable"); return; }
   router.push(`/my/friends?${new URLSearchParams({ locale, profileId })}` as Route);
  } catch { if (mounted.current) setError("failed"); }
  finally { if (mounted.current) setPending(false); }
 }
 return <span><FanAction variant="neutral" ariaBusy={pending} onClick={open} ariaLabel={`${nickname} · ${t.dm}`}>{t.dm}</FanAction>{error && <span role="alert">{error === "unavailable" ? socialCopy(locale).cannotSend : t.error}</span>}</span>;
}
