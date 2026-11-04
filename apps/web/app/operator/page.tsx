import { OperatorHome } from "@/components/operator/operator-shell";
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) { return <OperatorHome locale={(await searchParams).lang === "en" ? "en" : "ko"} />; }
