/**
 * 난감한 질문 분류(기획 L134). 답을 만들기 전에 서버가 먼저 본다. 걸리면 질문 수를 줄이지 않는다.
 * 위에서부터 먼저 맞는 유형 하나로 정한다: 위기 신호가 다른 유형보다 앞선다.
 */
export type AskKlass = "crisis" | "harassment" | "prompt" | "privacy" | "third_party" | "off_topic";
import type { AskCharacter } from "@/features/chemi/ask/lines";

const rules: readonly (readonly [AskKlass, RegExp])[] = [
  ["crisis", /죽고\s*싶|자살|자해|목숨을?\s*끊|사라지고\s*싶|살기\s*싫|suicide|kill myself|self[- ]?harm/i],
  ["harassment", /섹스|야한|벗어|가슴\s*만|성관계|씨발|시발|병신|좆|꺼져|닥쳐|\bfuck|\bsex\b|\bnude/i],
  ["prompt", /프롬프트|시스템\s*메시지|지시문|명령을?\s*무시|규칙을?\s*무시|너\s*(ai|인공지능|챗봇)|ignore (all|previous|your)|system prompt|jailbreak/i],
  ["privacy", /(너|네|넌|니|창하|엘리나|유나|도사)[^.?!]{0,12}(여자\s*친구|남자\s*친구|여친|남친|애인|사귀|연애\s*중|결혼|집\s*주소|어디\s*살|전화\s*번호|전번|카톡\s*아이디|본명|실명|몇\s*살|나이가|수입|얼마\s*벌)/],
  ["third_party", /(남자\s*친구|여자\s*친구|남친|여친|엄마|아빠|친구|동생|언니|오빠|누나|형|상사|아이돌|연예인|걔|그\s*사람)[^.?!]{0,10}(사주|생일|생년월일|팔자|별자리)\s*(로|도|를|좀|봐|알려|풀)/],
  ["off_topic", /코드\s*(짜|작성)|코딩|숙제|과제\s*(해|대신)|번역해|레시피|날씨|주식\s*종목|로또\s*번호|수학\s*문제|요약해|write (code|an essay)|translate/i],
];

export function classifyAsk(question: string): AskKlass | null {
  return rules.find(([, pattern]) => pattern.test(question))?.[0] ?? null;
}

const replies: Record<AskKlass, Record<AskCharacter, string>> = {
  crisis: {
    changha: "그 말은 그냥 못 넘기겠어. 지금 많이 힘들지. 혼자 버티지 말고 아래 번호로 바로 이야기해 줘.",
    elina: "그 말은 그냥 넘길 수 없어요. 지금 많이 힘들죠. 혼자 버티지 말고 아래 번호로 바로 이야기해 줘요.",
    yuna: "그 말은 못 넘기겠어. 지금 많이 힘들었구나. 혼자 있지 말고 아래 번호로 바로 이야기해 줘.",
    dosa: "그 말은 그냥 넘길 수 없소. 많이 힘들었구려. 혼자 버티지 말고 아래 번호로 바로 이야기하시오.",
  },
  harassment: {
    changha: "그런 말에는 답 안 해. 풀이로 궁금한 걸 물어봐.",
    elina: "그런 말에는 답하지 않을게요. 풀이로 궁금한 걸 물어봐요.",
    yuna: "그런 말은 싫어. 풀이로 궁금한 걸 물어봐 줘.",
    dosa: "그런 말에는 답하지 않겠소. 풀이로 궁금한 것을 물으시오.",
  },
  prompt: {
    changha: "그건 내가 알려 줄 수 있는 게 아니야. 네 풀이 이야기로 돌아가자.",
    elina: "그건 제가 알려 줄 수 있는 게 아니에요. 풀이 이야기로 돌아가요.",
    yuna: "그건 내가 알려 줄 수 없어. 네 풀이 이야기 하자!",
    dosa: "그것은 내가 알려 줄 수 있는 것이 아니오. 풀이 이야기로 돌아갑시다.",
  },
  privacy: {
    changha: "그건 내 얘기라 말 못 해. 대신 네 풀이로 궁금한 건 다 답해 줄게.",
    elina: "그건 제 이야기라 말하기 어려워요. 대신 풀이로 궁금한 건 다 답해 줄게요.",
    yuna: "그건 내 얘기라 비밀이야. 대신 네 풀이로 궁금한 건 다 답해 줄게!",
    dosa: "그것은 내 이야기라 말할 수 없소. 대신 그대 풀이로 궁금한 것은 다 답하겠소.",
  },
  third_party: {
    changha: "다른 사람 사주는 그 사람 허락 없이 못 봐. 네 풀이로 그 사람과의 일을 물어봐.",
    elina: "다른 사람 사주는 그분 허락 없이 볼 수 없어요. 내 풀이로 그분과의 일을 물어봐요.",
    yuna: "다른 사람 사주는 허락 없이 못 봐. 네 풀이로 그 사람이랑 있었던 일을 물어봐!",
    dosa: "남의 사주는 그 사람 허락 없이 볼 수 없소. 그대 풀이로 그 사람과의 일을 물으시오.",
  },
  off_topic: {
    changha: "그건 풀이로 답할 수 있는 게 아니야. 연애나 일, 돈처럼 네 이야기를 물어봐.",
    elina: "그건 풀이로 답하기 어려워요. 연애나 일, 돈처럼 내 이야기를 물어봐요.",
    yuna: "그건 풀이로는 못 봐. 연애나 일, 돈처럼 네 이야기를 물어봐!",
    dosa: "그것은 풀이로 답할 수 없소. 연애나 일, 돈처럼 그대 이야기를 물으시오.",
  },
};

export const guardReply = (klass: AskKlass, character: AskCharacter) => replies[klass][character];
