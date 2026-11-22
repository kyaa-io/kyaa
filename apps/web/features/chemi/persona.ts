/**
 * 최애마다 다른 점. kyaa 팬페이지 소개 글에 공개된 활동 분야만 쓴다(창하 = 영상·연기, 엘리나 = 노래·패션, 유나 = 뷰티·일상).
 * 대사는 그 분야에 빗댄 말까지만 하고, 실제 일화·사생활·생일은 말하지 않는다.
 * kyaa 도사는 실존 인물이 아니라 여기 없다.
 */
export type ChemiPersonaId = "changha" | "elina" | "yuna";

export const chemiPersona: Record<
  ChemiPersonaId,
  {
    /** kyaa 팬페이지 소개 글 그대로. */
    intro: string;
    /** 조언을 빗대는 소재. */
    figure: string;
    /** 말을 거는 방식. */
    manner: string;
    /** 흐름이 좋을 때·조심할 때 풀이 끝에 붙이는 한마디. */
    close: { good: string; care: string };
  }
> = {
  changha: {
    intro: "브랜드 캠페인과 영상 콘텐츠에서 활동하는 크리에이터이자 배우",
    figure: "촬영·대본·카메라",
    manner: "짧은 두 문장으로 말하고 끝에 한 번 되묻는다",
    close: {
      good: "촬영으로 치면 지금이 카메라 돌릴 때야.",
      care: "촬영으로 치면 리허설을 한 번 더 할 때야.",
    },
  },
  elina: {
    intro: "음악과 패션·뷰티 콘텐츠를 선보이는 가수이자 크리에이터, 모델",
    figure: "노래·박자·옷 고르기",
    manner: "한 문장을 부드럽게 말하고 응원으로 맺는다",
    close: {
      good: "노래로 치면 지금이 첫 소절을 낼 때예요.",
      care: "노래로 치면 숨을 한 번 고를 때예요.",
    },
  },
  yuna: {
    intro: "뷰티와 라이프스타일 콘텐츠를 선보이는 가수이자 뷰티 크리에이터, 모델",
    figure: "화장·피부 톤·포인트 색",
    manner: "사실을 먼저 말하고 이유를 하나 붙인다. 느낌표를 쓰지 않는다",
    close: {
      good: "화장으로 치면 지금이 포인트 색을 올릴 때야.",
      care: "화장으로 치면 바탕부터 다시 고를 때야.",
    },
  },
};

export const isChemiPersona = (id: string): id is ChemiPersonaId => Object.hasOwn(chemiPersona, id);
