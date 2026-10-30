import type { Metadata } from "next";
import { WinnerNotice } from "@/features/runmusic/winner-notice";
export const metadata: Metadata = { title: "RUN&MUSIC 이벤트 당첨 안내 | kyaa", robots: { index: false, follow: false } };
export default function Page() { return <WinnerNotice />; }
