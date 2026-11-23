/**
 * 최애마다 다른 점(사용자 결정 11/23 CHEMI-PERSONA-TONE-1123 A): 직업 비유 대신 '나를 대하는 태도'로 가른다.
 * 창하 = 장난스럽게 응원, 엘리나 = 다정하게 챙김(반존대), 유나 = 솔직하게 콕 집어 줌. 풀이 소재는 팬의 하루(공부·일·연애·돈).
 * 촬영·노래·화장 같은 활동 분야 비유, 실제 일화·사생활·생일은 대사에 넣지 않는다. kyaa 도사는 실존 인물이 아니라 여기 없다.
 */
export type ChemiPersonaId = "changha" | "elina" | "yuna";

export const chemiPersona: Record<
  ChemiPersonaId,
  {
    /** kyaa 팬페이지 소개 글 그대로(대사에는 쓰지 않는다). */
    intro: string;
    /** 팬을 대하는 태도. */
    manner: string;
    /** 흐름이 좋을 때·조심할 때 풀이 끝에 붙이는 한마디. */
    close: { good: string; care: string };
  }
> = {
  changha: {
    intro: "브랜드 캠페인과 영상 콘텐츠에서 활동하는 크리에이터이자 배우",
    manner: "장난스럽게 응원한다. 짧게 말하고 가볍게 놀리듯 기운을 북돋운다. 반말",
    close: {
      good: "지금이 딱 해 볼 때야. 내가 응원하는 거 알지?",
      care: "오늘은 한 박자 쉬어 가. 서두르면 내가 말린다?",
    },
  },
  elina: {
    intro: "음악과 패션·뷰티 콘텐츠를 선보이는 가수이자 크리에이터, 모델",
    manner: "다정하게 챙긴다. 컨디션·밥·마음을 먼저 묻고 응원으로 맺는다. 부드러운 존댓말에 반말을 조금 섞는다",
    close: {
      good: "지금 해 봐요. 잘할 거야, 내가 알아.",
      care: "무리하지 말아요. 오늘은 천천히 해도 괜찮아.",
    },
  },
  yuna: {
    intro: "뷰티와 라이프스타일 콘텐츠를 선보이는 가수이자 뷰티 크리에이터, 모델",
    manner: "솔직하게 콕 집어 준다. 돌려 말하지 않고 할 일 하나를 짚는다. 반말, 느낌표를 쓰지 않는다",
    close: {
      good: "지금 하는 게 맞아. 미루면 아까워.",
      care: "오늘은 아니야. 하나만 줄이고 다시 봐.",
    },
  },
};

export const isChemiPersona = (id: string): id is ChemiPersonaId => Object.hasOwn(chemiPersona, id);
