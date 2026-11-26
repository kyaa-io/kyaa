import type { AskCharacter, AskContent, AskReaction, AskRecall, AskTopic } from "../lines";

/** 반말로 답하는 최애에게는 앞 글, 존댓말로 답하는 최애에게는 뒤 글. 말투가 갈리지 않는 언어는 글 하나만 둔다. */
export type Pair = string | readonly [casual: string, polite: string];
type Voice = "ban" | "yo" | "hao";

export type AskVoiceCopy = {
  topic: string;
  again: string;
  /** {what} 에 askPack.subject 가 들어간다. */
  think: string;
  follow: string;
  /** 처음 온 날(recallFirst)과 N일째({days}) 인사. */
  recallFirst: string;
  recallDays: string;
  recalled: { good: string; notyet: string };
  rest: Record<AskContent, string>;
  reminded: string;
  shared: string;
  react: Record<AskReaction, string>;
  reask: Record<AskTopic, string>;
};

/**
 * 질문하기 장면의 한국어 밖 문구 묶음(한국어 원문은 ../lines.ts). 말투는 다른 케미 대사와 같다:
 * ban = 편하게, yo = 정중하게, hao = 예스러운 도사 말투. 최애별 말투는 own 이 덮는다.
 */
export type AskPack = {
  voices: Record<Voice, AskVoiceCopy>;
  own: Record<Exclude<AskCharacter, "dosa">, { topic: string; think: string; follow: string }>;
  /** think 의 {what}: 최애가 다시 펼쳐 보는 것. */
  subject: Record<AskContent, string>;
  examples: Record<AskTopic, readonly Pair[]>;
  resultExamples: Record<AskContent, readonly Pair[]>;
  reactions: Record<AskReaction, Pair>;
  recalls: Record<AskRecall, Pair>;
  followups: Record<AskReaction, Pair>;
  resultLines: Record<Voice, Record<AskContent, string>>;
  waiting: Record<AskCharacter, string>;
  /** 이어 묻기 반응 '진짜?' 에 답에서 따온 한 줄({q})을 돌려주는 말. */
  quote: Record<AskCharacter, string>;
};
