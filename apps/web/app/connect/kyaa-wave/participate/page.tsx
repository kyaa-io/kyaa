import type { Metadata } from "next";
import { Suspense } from "react";
import { KyaaWaveParticipationScreen } from "@/features/connect/kyaa-wave-participation-screen";

export const metadata: Metadata = {
  title: "kyaa wave | 참여 확인",
  robots: { index: false, follow: false },
};

export default function KyaaWaveParticipationPage() {
  return <Suspense><KyaaWaveParticipationScreen /></Suspense>;
}
