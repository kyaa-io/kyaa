import { FanRouteSkeleton } from "@/components/fan-ui/fan-route-skeleton";
import type { Metadata } from "next";
import { Suspense } from "react";
import { RunmusicScreen } from "@/features/connect/runmusic-screen";

export const metadata: Metadata = { title: "RUN&MUSIC · Results | kyaa", robots: { index: false, follow: false } };
export default function RunmusicResultsPage() { return <Suspense fallback={<FanRouteSkeleton layout="detail" />}><RunmusicScreen resultsOnly /></Suspense>; }
