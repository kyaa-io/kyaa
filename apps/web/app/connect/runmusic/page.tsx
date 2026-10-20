import type { Metadata } from "next";
import { Suspense } from "react";
import { RunmusicScreen } from "@/features/connect/runmusic-screen";

export const metadata: Metadata = { title: "RUN&MUSIC × kyaa", description: "RUN&MUSIC · 2026.10.24 · 안동체육관" };
export default function RunmusicPage() { return <Suspense><RunmusicScreen /></Suspense>; }
