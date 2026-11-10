"use client";

import { useAppLocale } from "@/components/locale-provider";
import { FanSkeletonPage, type FanSkeletonPageLayout } from "./fan-skeleton";

/** loading.tsx 와 Suspense 폴백용. 로케일은 공급자에서 읽으므로 서버 폴백이 searchParams 를 몰라도 된다. */
export function FanRouteSkeleton({ layout = "list" }: Readonly<{ layout?: FanSkeletonPageLayout }>) {
  const { locale } = useAppLocale();
  return <FanSkeletonPage locale={locale} layout={layout} />;
}
