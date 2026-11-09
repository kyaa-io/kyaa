"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { z } from "zod";
import { useAppLocale } from "@/components/locale-provider";
import { PROFILE_RETURN_PARAM } from "./profile-ref";
import { closeProfileWindow, openProfileWindow, useProfileWindowTarget } from "./profile-window";

const ProfileModal = dynamic(() => import("./profile-modal").then(module => module.ProfileModal), { ssr: false });

/** Mounted once in the root layout. After sign-in, `?profile=<return ref>` opens the same window again and leaves the address. */
export function ProfileWindowHost() {
  const target = useProfileWindowTarget(), { locale } = useAppLocale();
  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get(PROFILE_RETURN_PARAM);
    if (token === null) return;
    url.searchParams.delete(PROFILE_RETURN_PARAM);
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    if (z.uuid().safeParse(token).success) openProfileWindow({ ref: { kind: "return", token }, nickname: "", avatarUrl: null });
  }, []);
  if (!target) return null;
  return <ProfileModal key={JSON.stringify(target.ref ?? target.profileId)} person={target} locale={locale} onClose={closeProfileWindow}/>;
}
