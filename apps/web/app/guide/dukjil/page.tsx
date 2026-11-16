import { redirect } from "next/navigation";
import { followEventPath } from "@/app/follow/follow-event";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** 덕질미션북은 /follow 이벤트 화면 아래로 합쳤다(사용자 11/16). 옛 주소는 locale·utm 같은 쿼리를 그대로 들고 /follow 로 간다. */
export default async function DukjilGuidePage({ searchParams }: Props) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) for (const item of [value ?? []].flat()) query.append(key, item);
  redirect(`${followEventPath}${query.size ? `?${query}` : ""}`);
}
