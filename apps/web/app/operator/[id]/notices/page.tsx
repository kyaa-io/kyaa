import { OperatorNotices } from "@/components/operator/operator-pages";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string }> }) { return <OperatorNotices channelId={(await params).id} locale={(await searchParams).lang === "en" ? "en" : "ko"} />; }
