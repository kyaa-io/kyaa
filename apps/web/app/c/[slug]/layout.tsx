import type { ReactNode } from "react";
import { WaveRouteBoundary } from "@/features/fanpage/ui/wave-access-boundary";
export default async function CreatorLayout({ params, children }: { params: Promise<{ slug: string }>; children: ReactNode }) {
  return <WaveRouteBoundary slug={(await params).slug}>{children}</WaveRouteBoundary>;
}
