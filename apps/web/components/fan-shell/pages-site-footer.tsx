"use client";

import { usePathname } from "next/navigation";
import { usePageLocale } from "@/components/locale-provider";

import { FanSiteFooter } from "./fan-site-footer";

export function PagesSiteFooter() {
  const locale = usePageLocale();
  const pathname = usePathname();
  if (pathname === "/pages/live-dashboard") return null;
  return <FanSiteFooter locale={locale} />;
}
