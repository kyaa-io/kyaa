import { isFortuneResult } from "@/app/chemi/fortune/reading";
import { fortuneTalkLine, type FortuneCharacterId } from "@/app/chemi/fortune/lines";
import { roughHeadline } from "@/app/chemi/saju/copy";
import { dayHeadline } from "@/app/chemi/fortune/result-copy";
import type { Chart } from "@/app/chemi/saju/chart";

/**
 * 공유 카드에 담을 결과 요약. 저장된 결과에서 서버가 만들고, 생일·일진·근거는 넣지 않는다(시트 04-3 · 14).
 * 운세: 최애 한마디(결과 화면의 반응 줄과 같은 대사) + 점수·등급 + 키워드(덕질 점수·행운색·행운 시간).
 * 사주: 일간 한 줄 제목. 별자리·타로는 자기 카드가 따로 있어 빈 요약을 넘긴다.
 */
export function shareSummary(
  character: FortuneCharacterId,
  result: unknown,
  styled: { share?: { line?: unknown } } | null | undefined,
): Record<string, unknown> {
  const value = result as Record<string, any> | null;
  if (isFortuneResult(value)) {
    const fortune = value as Record<string, any>;
    const styledLine = typeof styled?.share?.line === "string" ? styled.share.line : null;
    return {
      line:
        styledLine ??
        fortuneTalkLine(character, 4, {
          score: fortune.score,
          grade: fortune.grade.name,
          fandom: fortune.fields.fandom,
          money: fortune.fields.money,
          people: fortune.fields.people,
          luckyHour: fortune.luck.luckyHour,
          color: fortune.luck.color,
        }),
      title: dayHeadline(fortune.evidence.tenGod, fortune.grade.name),
      score: fortune.score,
      grade: fortune.grade.name,
      keywords: {
        fandom: fortune.fields.fandom,
        color: fortune.luck.color,
        luckyHour: fortune.luck.luckyHour ?? null,
      },
    };
  }
  const stem = (value as Chart | null)?.pillars?.day?.heavenlyStem;
  if (typeof stem === "string") {
    try {
      return { line: roughHeadline(stem as Parameters<typeof roughHeadline>[0]) };
    } catch {
      return {};
    }
  }
  return {};
}
