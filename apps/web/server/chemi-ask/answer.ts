/**
 * 질문 답. 저장된 풀이 값(점수·일간·별점·카드)과 고른 주제로 최애 말투 문장을 만든다.
 * 같은 풀이·같은 질문이면 같은 답이 나온다. 풀이에 없는 사실(날짜·사람·금액)은 지어내지 않는다.
 */
import { branchElement, controls, elementCounts, elementName, generates, isChart, stemElement, type Element } from "@/app/chemi/saju/chart";
import { sajuWhy } from "@/app/chemi/saju/depth";
import { fortuneWhy } from "@/app/chemi/fortune/depth";
import { aspectNames, bodyNames, targetName } from "@/app/chemi/star/copy";
import { withParticle } from "@/app/chemi/star/particle";
import { TAROT_DECK } from "@/features/chemi/tarot/deck";
import { tarotBasis } from "@/features/chemi/tarot/depth";
import { chemiPersona, isChemiPersona } from "@/features/chemi/persona";
import { askVoice as voice, type AskCharacter, type AskContent, type AskTopic } from "@/features/chemi/ask/lines";

export { ASK_TOPICS } from "@/features/chemi/ask/lines";
type Voice = "ban" | "yo" | "hao";

const topicName: Record<AskTopic, string> = { love: "연애", work: "일", money: "돈", people: "관계", month: "이번 달", free: "오늘" };

/** 풀이에서 읽은 근거 한 줄과, 주제의 흐름이 좋은 편인지. */
type Basis = { line: Record<Voice, string>; good: boolean };

const fortuneField: Record<AskTopic, "love" | "work" | "money" | "people" | null> = {
  love: "love", work: "work", money: "money", people: "people", month: null, free: null,
};
const starField = fortuneField;

function seed(text: string) {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash;
}

const elementTrait: Record<Element, string> = {
  wood: "한번 정하면 곧게 뻗는", fire: "마음이 먼저 달려가는", earth: "천천히 다지는", metal: "맺고 끊음이 분명한", water: "흐름을 읽고 맞춰 가는",
};

/** 규칙 문장과 AI 답이 같은 근거를 쓰도록 내보낸다. */
export function askBasis(content: AskContent, topic: AskTopic, result: any, question: string, kind?: string): Basis {
  if (content === "fortune" && kind === "week" && Array.isArray(result?.days) && result.days.length) {
    const strongest = result.days.reduce((best: any, row: any) => row.result.score > best.result.score ? row : best);
    const date = strongest.day.slice(5).replace("-", "/");
    return {
      good: strongest.result.score >= 70,
      line: { ban: `이번 주에는 ${date} 점수가 가장 높아.`, yo: `이번 주에는 ${date} 점수가 가장 높아요.`, hao: `이번 주에는 ${date} 점수가 가장 높소.` },
    };
  }
  if (content === "star" && kind === "compat") {
    const count = (result?.connections ?? result?.angles ?? []).length;
    const line = `궁합 풀이에서 확인한 연결은 ${count}개`;
    return { good: count > 0, line: { ban: `${line}야.`, yo: `${line}예요.`, hao: `${line}요.` } };
  }
  if (content === "tarot" && kind === "tarot3" && result?.cards?.length === 3) {
    const cards = result.cards.map(({ card, reversed }: { card: number; reversed: boolean }) =>
      `${TAROT_DECK[card]?.[1]}(${reversed ? "역방향" : "정방향"})`).join(" → ");
    return { good: !result.cards[2].reversed, line: { ban: `세 장은 ${cards} 순서야.`, yo: `세 장은 ${cards} 순서예요.`, hao: `세 장은 ${cards} 순서요.` } };
  }
  if (content === "fortune" && typeof result?.score === "number") {
    const key = fortuneField[topic];
    const score: number = key ? result.fields?.[key] ?? result.score : result.score;
    const day = kind === "tomorrow" ? "내일" : "오늘";
    const name = key ? `${kind === "tomorrow" ? "내일 " : ""}${topicName[topic]} 운이` : `${day} 운세가`;
    return {
      good: score >= 70,
      line: { ban: `${name} ${score}점이야.`, yo: `${name} ${score}점이에요.`, hao: `${name} ${score}점이오.` },
    };
  }
  if (content === "star" && typeof result?.stars?.overall === "number") {
    const key = starField[topic];
    const stars: number = key ? result.stars[key] ?? result.stars.overall : result.stars.overall;
    const name = key ? topicName[topic] : "오늘 전체";
    return {
      good: stars >= 3,
      line: { ban: `${name} 별이 다섯 개 중 ${stars}개야.`, yo: `${name} 별이 다섯 개 중 ${stars}개예요.`, hao: `${name} 별이 다섯 중 ${stars}개요.` },
    };
  }
  if (content === "tarot") {
    const first = result?.cards?.[0] ?? result;
    const card = TAROT_DECK[first?.card as number];
    if (card) {
      const way = first.reversed ? "거꾸로" : "똑바로";
      return {
        good: !first.reversed,
        line: { ban: `오늘 카드는 ${card[1]}, ${way} 나왔어.`, yo: `오늘 카드는 ${card[1]}, ${way} 나왔어요.`, hao: `오늘 카드는 ${card[1]}, ${way} 나왔소.` },
      };
    }
  }
  if (content === "saju" && isChart(result)) {
    const stem = result.pillars.day!.heavenlyStem;
    const element = stemElement[stem];
    const counts = elementCounts(result);
    // 주제마다 사주에서 보는 자리가 다르다: 돈은 내가 다루는 기운, 일은 나를 다스리는 기운, 사람은 나와 같은 기운, 연애는 일지.
    if (topic === "money" || topic === "work" || topic === "people") {
      const target = topic === "money" ? controls[element] : topic === "people" ? element
        : (Object.keys(controls) as Element[]).find((key) => controls[key] === element)!;
      const count = counts[target] - (topic === "people" ? 1 : 0);
      const name = elementName[target];
      const head = { money: "돈은", work: "일은", people: "사람은" }[topic];
      const same = topic === "people";
      return {
        good: count > 0,
        line: count > 0
          ? {
              ban: `${head} ${same ? "너와 같은 " : ""}${name} 기운으로 봐. 네 사주에 ${count}개 ${same ? "더 " : ""}있어.`,
              yo: `${head} ${same ? "나와 같은 " : ""}${name} 기운으로 봐요. 사주에 ${count}개 ${same ? "더 " : ""}있어요.`,
              hao: `${head} ${same ? "그대와 같은 " : ""}${name} 기운으로 보오. 그대 사주에 ${count}개 ${same ? "더 " : ""}있소.`,
            }
          : {
              ban: `${head} ${same ? "너와 같은 " : ""}${name} 기운으로 봐. 네 사주에는 ${same ? "더 " : ""}없어.`,
              yo: `${head} ${same ? "나와 같은 " : ""}${name} 기운으로 봐요. 사주에는 ${same ? "더 " : ""}없어요.`,
              hao: `${head} ${same ? "그대와 같은 " : ""}${name} 기운으로 보오. 그대 사주에는 ${same ? "더 " : ""}없소.`,
            },
      };
    }
    if (topic === "love") {
      const branch = result.pillars.day!.earthlyBranch;
      const seat = branchElement[branch];
      // 일지의 기운이 일간과 같거나 서로 낳아 주면 편한 자리, 누르는 사이면 조심할 자리로 읽는다.
      const good = seat === element || generates[seat] === element || generates[element] === seat;
      const name = elementName[seat];
      return {
        good,
        line: {
          ban: `연애는 일지를 봐. 네 일지는 ${branch}, ${name} 기운이야.`,
          yo: `연애는 일지를 봐요. 일지가 ${branch}, ${name} 기운이에요.`,
          hao: `연애는 일지를 보오. 그대 일지는 ${branch}, ${name} 기운이오.`,
        },
      };
    }
    const trait = `${elementName[element]} 기운, ${elementTrait[element]} 사람`;
    return {
      good: seed(question + stem) % 3 > 0,
      line: { ban: `네 일간은 ${stem}. ${trait}이야.`, yo: `일간이 ${stem}이에요. ${trait}이에요.`, hao: `그대 일간은 ${stem}. ${trait}이오.` },
    };
  }
  return {
    good: seed(question) % 2 === 0,
    line: { ban: "오늘 풀이를 다시 읽어 봤어.", yo: "오늘 풀이를 다시 읽어 봤어요.", hao: "오늘 풀이를 다시 읽어 보았소." },
  };
}

/**
 * 풀이의 계산 근거 한 줄(결과 화면의 '풀이 근거'와 같은 값). '왜 그렇게 나왔어?'에 답할 때와 AI 답의 풀이 값에 쓴다.
 * 사주는 지금 시각의 세운(이번 달 주제는 월운), 운세는 그날 일진의 십신, 별자리는 가장 센 행성 각도, 타로는 카드 종류와 방향.
 */
export function askEvidence(content: AskContent, topic: AskTopic, result: any, kind?: string, at: number = Date.now()): Record<Voice, string> | null {
  return evidenceOf(content, topic, result, kind, at)?.line ?? null;
}

type TenGodName = keyof typeof becauseGod;
function evidenceOf(content: AskContent, topic: AskTopic, result: any, kind?: string, at: number = Date.now()): { line: Record<Voice, string>; god?: string } | null {
  /** 받침에 맞춘 맺음말: 비견이야·겁재야. */
  const is = (word: string): Record<Voice, string> =>
    withParticle(word, "은는").endsWith("은")
      ? { ban: `${word}이야.`, yo: `${word}이에요.`, hao: `${word}이오.` }
      : { ban: `${word}야.`, yo: `${word}예요.`, hao: `${word}요.` };
  const gloss = (god: string, short: string) => ({
    ban: `${withParticle(god, "은는")} '${short}'이라는 뜻이야.`,
    yo: `${withParticle(god, "은는")} '${short}'이라는 뜻이에요.`,
    hao: `${withParticle(god, "은는")} '${short}'이라는 뜻이오.`,
  });
  if (content === "saju" && isChart(result)) {
    const why = sajuWhy(result, at, topic === "month");
    const said = gloss(why.god, why.short);
    return { god: why.god, line: {
      ban: `${why.unit} ${why.pillar}은 네 일간에게 ${is(why.god).ban} ${said.ban}`,
      yo: `${why.unit} ${why.pillar}은 일간에게 ${is(why.god).yo} ${said.yo}`,
      hao: `${why.unit} ${why.pillar}은 그대 일간에게 ${is(why.god).hao} ${said.hao}`,
    } };
  }
  if (content === "fortune" && kind !== "week" && result?.evidence) {
    const why = fortuneWhy(result.evidence);
    if (!why) return null;
    const day = kind === "tomorrow" ? "내일" : "오늘";
    const said = gloss(why.god, why.short);
    return { god: why.god, line: {
      ban: `${day} 일진 ${withParticle(why.pillar, "은는")} 네 일간에게 ${is(why.god).ban} ${said.ban}`,
      yo: `${day} 일진 ${withParticle(why.pillar, "은는")} 일간에게 ${is(why.god).yo} ${said.yo}`,
      hao: `${day} 일진 ${withParticle(why.pillar, "은는")} 그대 일간에게 ${is(why.god).hao} ${said.hao}`,
    } };
  }
  if (content === "star" && kind !== "compat" && Array.isArray(result?.reasons) && result.reasons.length) {
    const reason = result.reasons[0];
    const body = bodyNames[reason.body] ?? reason.body;
    const target = targetName(reason.target);
    const aspect = aspectNames[reason.angle]?.name ?? "각";
    const head = `오늘 ${withParticle(body, "이가")}`;
    return { line: {
      ban: `${head} 네 ${withParticle(target, "과와")} ${aspect} 각도야.`,
      yo: `${head} 내 ${withParticle(target, "과와")} ${aspect} 각도예요.`,
      hao: `${head} 그대의 ${withParticle(target, "과와")} ${aspect} 각도요.`,
    } };
  }
  if (content === "tarot") {
    const first = result?.cards?.[0] ?? result;
    const card = TAROT_DECK[first?.card as number];
    const kindRow = card ? tarotBasis(first.card, Boolean(first.reversed))[0] : null;
    if (card && kindRow) {
      const kindName = is(kindRow.value.replace(" · ", " "));
      return { line: {
        ban: `${card[1]} 카드는 ${kindName.ban}`,
        yo: `${card[1]} 카드는 ${kindName.yo}`,
        hao: `${card[1]} 카드는 ${kindName.hao}`,
      } };
    }
  }
  return null;
}

/** 주제 × 흐름(좋음·조심) × 말투. 한 칸에 두 줄을 두고 질문 글자로 하나를 고른다. */
const advice: Record<AskTopic, Record<"good" | "care", Record<Voice, readonly [string, string]>>> = {
  love: {
    good: {
      ban: ["마음이 가는 쪽에 먼저 짧게 말을 걸어 봐. 길게 쓰지 않아도 전해져.", "오늘은 솔직한 한마디가 통하는 날이야. 돌려 말하지 마."],
      yo: ["마음이 가는 쪽에 먼저 짧게 말을 걸어 봐요. 길게 쓰지 않아도 전해져요.", "오늘은 솔직한 한마디가 통하는 날이에요. 돌려 말하지 않아도 돼요."],
      hao: ["마음이 가는 쪽에 먼저 짧게 말을 거시오. 길지 않아도 전해지오.", "오늘은 솔직한 한마디가 통하는 날이오. 돌려 말하지 마시오."],
    },
    care: {
      ban: ["답을 재촉하지 마. 하루만 두면 상대가 먼저 움직여.", "오늘은 확인하려 들면 어긋나. 네 할 일부터 하고 저녁에 연락해."],
      yo: ["답을 재촉하지 않는 게 좋아요. 하루만 두면 상대가 먼저 움직여요.", "오늘은 확인하려 들면 어긋나요. 내 할 일부터 하고 저녁에 연락해요."],
      hao: ["답을 재촉하지 마시오. 하루만 두면 상대가 먼저 움직이오.", "오늘은 확인하려 들면 어긋나오. 할 일부터 하고 저녁에 연락하시오."],
    },
  },
  work: {
    good: {
      ban: ["미뤄 둔 일을 오늘 꺼내. 시작만 하면 생각보다 빨리 끝나.", "준비한 말보다 직접 겪은 일을 먼저 꺼내 봐. 그게 더 먹혀."],
      yo: ["미뤄 둔 일을 오늘 꺼내 봐요. 시작만 하면 생각보다 빨리 끝나요.", "준비한 답보다 직접 겪은 일을 먼저 꺼내 봐요. 그게 더 잘 전해져요."],
      hao: ["미뤄 둔 일을 오늘 꺼내시오. 시작만 하면 생각보다 빨리 끝나오.", "준비한 말보다 직접 겪은 일을 먼저 꺼내시오. 그것이 더 통하오."],
    },
    care: {
      ban: ["큰 결정은 오늘 내리지 마. 한 가지만 끝내고 나머지는 내일 봐.", "오늘은 새로 벌이지 말고 하던 것부터 마무리해."],
      yo: ["큰 결정은 오늘 내리지 않는 게 좋아요. 한 가지만 끝내고 나머지는 내일 봐요.", "오늘은 새로 벌이기보다 하던 것부터 마무리해요."],
      hao: ["큰 결정은 오늘 내리지 마시오. 한 가지만 끝내고 나머지는 내일 보시오.", "오늘은 새로 벌이지 말고 하던 것부터 마무리하시오."],
    },
  },
  money: {
    good: {
      ban: ["꼭 필요했던 한 가지는 사도 돼. 두 번째부터는 다음에 봐.", "오늘은 들어올 돈을 먼저 챙겨. 받을 게 있으면 지금 말해."],
      yo: ["꼭 필요했던 한 가지는 사도 괜찮아요. 두 번째부터는 다음에 봐요.", "오늘은 들어올 돈을 먼저 챙겨요. 받을 게 있으면 지금 말해요."],
      hao: ["꼭 필요했던 한 가지는 사도 되오. 두 번째부터는 다음에 보시오.", "오늘은 들어올 돈을 먼저 챙기시오. 받을 것이 있으면 지금 말하시오."],
    },
    care: {
      ban: ["사려던 건 하루 미뤄. 내일 봐도 갖고 싶으면 그때 사.", "큰돈은 움직이지 마. 장바구니에 담아만 둬."],
      yo: ["사려던 건 하루 미뤄 봐요. 내일 봐도 갖고 싶으면 그때 사요.", "큰돈은 움직이지 않는 게 좋아요. 장바구니에 담아만 둬요."],
      hao: ["사려던 것은 하루 미루시오. 내일 보아도 갖고 싶으면 그때 사시오.", "큰돈은 움직이지 마시오. 담아만 두시오."],
    },
  },
  people: {
    good: {
      ban: ["먼저 연락해도 좋은 날이야. 안부 한 줄이면 돼.", "오늘은 처음 보는 사람과도 말이 잘 통해. 자리를 피하지 마."],
      yo: ["먼저 연락해도 좋은 날이에요. 안부 한 줄이면 돼요.", "오늘은 처음 보는 사람과도 말이 잘 통해요. 자리를 피하지 않아도 돼요."],
      hao: ["먼저 연락해도 좋은 날이오. 안부 한 줄이면 되오.", "오늘은 처음 보는 사람과도 말이 통하오. 자리를 피하지 마시오."],
    },
    care: {
      ban: ["서운한 말은 오늘 꺼내지 마. 글로 적어 두고 내일 다시 읽어 봐.", "오늘은 듣는 쪽에 서. 네 얘기는 한 박자 늦게 해."],
      yo: ["서운한 말은 오늘 꺼내지 않는 게 좋아요. 글로 적어 두고 내일 다시 읽어 봐요.", "오늘은 듣는 쪽에 서 봐요. 내 얘기는 한 박자 늦게 해요."],
      hao: ["서운한 말은 오늘 꺼내지 마시오. 글로 적어 두고 내일 다시 읽으시오.", "오늘은 듣는 쪽에 서시오. 그대 이야기는 한 박자 늦게 하시오."],
    },
  },
  month: {
    good: {
      ban: ["이번 달은 하나를 정해서 끝까지 가. 중간에 바꾸지만 않으면 돼.", "이번 달은 시작한 걸 눈에 보이게 남겨. 기록이 다음 달 힘이 돼."],
      yo: ["이번 달은 하나를 정해서 끝까지 가 봐요. 중간에 바꾸지만 않으면 돼요.", "이번 달은 시작한 걸 눈에 보이게 남겨요. 기록이 다음 달 힘이 돼요."],
      hao: ["이번 달은 하나를 정해 끝까지 가시오. 중간에 바꾸지만 않으면 되오.", "이번 달은 시작한 것을 눈에 보이게 남기시오. 기록이 다음 달 힘이 되오."],
    },
    care: {
      ban: ["이번 달은 늘리지 말고 줄여. 약속 하나를 빼면 숨이 트여.", "이번 달은 쉬는 날을 먼저 달력에 적어. 나머지는 그다음이야."],
      yo: ["이번 달은 늘리기보다 줄여 봐요. 약속 하나를 빼면 숨이 트여요.", "이번 달은 쉬는 날을 먼저 달력에 적어요. 나머지는 그다음이에요."],
      hao: ["이번 달은 늘리지 말고 줄이시오. 약속 하나를 빼면 숨이 트이오.", "이번 달은 쉬는 날을 먼저 달력에 적으시오. 나머지는 그다음이오."],
    },
  },
  free: {
    good: {
      ban: ["네가 먼저 떠올린 답이 맞아. 그대로 해 봐.", "오늘은 해 보는 쪽이 남아. 작게 한 번 시작해."],
      yo: ["먼저 떠올린 답이 맞아요. 그대로 해 봐요.", "오늘은 해 보는 쪽이 남아요. 작게 한 번 시작해요."],
      hao: ["그대가 먼저 떠올린 답이 맞소. 그대로 하시오.", "오늘은 해 보는 쪽이 남소. 작게 한 번 시작하시오."],
    },
    care: {
      ban: ["오늘은 정하지 마. 자고 일어나서도 같은 마음이면 그때 해.", "지금은 한 걸음 물러서서 봐. 급한 건 그 일이 아니야."],
      yo: ["오늘은 정하지 않아도 돼요. 자고 일어나서도 같은 마음이면 그때 해요.", "지금은 한 걸음 물러서서 봐요. 급한 건 그 일이 아니에요."],
      hao: ["오늘은 정하지 마시오. 자고 일어나도 같은 마음이면 그때 하시오.", "지금은 한 걸음 물러서서 보시오. 급한 것은 그 일이 아니오."],
    },
  },
};

const more: Record<"good" | "care", Record<Voice, readonly [string, string]>> = {
  good: {
    ban: ["하나만 더 말하면, 망설이는 시간이 제일 아까워. 오늘 안에 한 번은 움직여.", "덧붙이면, 혼자 하지 말고 한 사람한테는 말해 둬. 그게 힘이 돼."],
    yo: ["하나만 더 말하면, 망설이는 시간이 제일 아까워요. 오늘 안에 한 번은 움직여 봐요.", "덧붙이면, 혼자 하지 말고 한 사람에게는 말해 둬요. 그게 힘이 돼요."],
    hao: ["하나만 더 이르자면, 망설이는 시간이 가장 아깝소. 오늘 안에 한 번은 움직이시오.", "덧붙이자면, 혼자 하지 말고 한 사람에게는 말해 두시오. 그것이 힘이 되오."],
  },
  care: {
    ban: ["하나만 더 말하면, 지금 안 해도 놓치는 건 없어. 다음 풀이에서 다시 보자.", "덧붙이면, 잠을 먼저 챙겨. 피곤할 때 내린 답은 자주 틀려."],
    yo: ["하나만 더 말하면, 지금 하지 않아도 놓치는 건 없어요. 다음 풀이에서 다시 봐요.", "덧붙이면, 잠을 먼저 챙겨요. 피곤할 때 내린 답은 자주 틀려요."],
    hao: ["하나만 더 이르자면, 지금 하지 않아도 놓치는 것은 없소. 다음 풀이에서 다시 봅시다.", "덧붙이자면, 잠을 먼저 챙기시오. 피곤할 때 내린 답은 자주 틀리오."],
  },
};

export function answerAsk(input: { character: AskCharacter; content: AskContent; topic: AskTopic; question: string; result: unknown; kind?: string }) {
  const tone = voice[input.character];
  const read = askBasis(input.content, input.topic, input.result, input.question, input.kind);
  const flow = read.good ? "good" : "care";
  const pick = advice[input.topic][flow][tone][seed(input.question) % 2];
  // 세 최애는 자기 활동 분야에 빗댄 한마디로 맺는다(도사는 없음).
  const close = isChemiPersona(input.character) ? `\n${chemiPersona[input.character].close[flow]}` : "";
  return `${read.line[tone]}\n${pick}${close}`;
}

/** 이어 물은 말이 까닭을 묻는지, 조심할 것을 묻는지. 둘 다 아니면 덧붙이는 한 마디를 준다. */
const followWhy = /왜|이유|어째서|근거|까닭/;
const followCare = /조심|주의|피해야|피할|걱정|불안/;
const because: Record<"good" | "care", Record<Voice, string>> = {
  good: { ban: "흐름이 받쳐 줘서 해 보라고 한 거야.", yo: "흐름이 받쳐 줘서 해 보라고 한 거예요.", hao: "흐름이 받쳐 주니 해 보라 한 것이오." },
  care: { ban: "흐름이 약해서 서두르지 말라고 한 거야.", yo: "흐름이 약해서 서두르지 말라고 한 거예요.", hao: "흐름이 약하니 서두르지 말라 한 것이오." },
};
const careLead: Record<Voice, string> = { ban: "조심할 건 하나야.", yo: "조심할 건 하나예요.", hao: "조심할 것은 하나요." };

/**
 * '왜'에 답할 때의 맺음: 근거로 댄 십신에서 결론을 끌어낸다(겁재 = 겨루는 기운이면 '먼저 말하는 쪽이 유리').
 * 흐름이 좋을 때와 조심할 때의 두 줄.
 */
const groupBecause = {
  peer: {
    good: { ban: "비슷한 힘이 맞붙는 때라 먼저 말하는 쪽이 유리해. 그래서 해 보라고 한 거야.", yo: "비슷한 힘이 맞붙는 때라 먼저 말하는 쪽이 유리해요. 그래서 해 보라고 한 거예요.", hao: "비슷한 힘이 맞붙는 때라 먼저 말하는 쪽이 유리하오. 그래서 해 보라 한 것이오." },
    care: { ban: "비슷한 힘이 맞붙는 때라 서두르면 부딪쳐. 그래서 한 박자 늦추라고 한 거야.", yo: "비슷한 힘이 맞붙는 때라 서두르면 부딪쳐요. 그래서 한 박자 늦추라고 한 거예요.", hao: "비슷한 힘이 맞붙는 때라 서두르면 부딪치오. 그래서 한 박자 늦추라 한 것이오." },
  },
  output: {
    good: { ban: "가진 걸 밖으로 꺼내는 기운이라 보여 줄수록 풀려. 그래서 해 보라고 한 거야.", yo: "가진 걸 밖으로 꺼내는 기운이라 보여 줄수록 풀려요. 그래서 해 보라고 한 거예요.", hao: "가진 것을 밖으로 꺼내는 기운이라 보일수록 풀리오. 그래서 해 보라 한 것이오." },
    care: { ban: "말과 행동이 앞서 나가기 쉬운 기운이야. 그래서 한마디 줄이라고 한 거야.", yo: "말과 행동이 앞서 나가기 쉬운 기운이에요. 그래서 한마디 줄이라고 한 거예요.", hao: "말과 행동이 앞서 나가기 쉬운 기운이오. 그래서 한마디 줄이라 한 것이오." },
  },
  wealth: {
    good: { ban: "움직인 만큼 손에 잡히는 기운이야. 그래서 미루지 말라고 한 거야.", yo: "움직인 만큼 손에 잡히는 기운이에요. 그래서 미루지 말라고 한 거예요.", hao: "움직인 만큼 손에 잡히는 기운이오. 그래서 미루지 말라 한 것이오." },
    care: { ban: "챙길 것이 한꺼번에 늘어 힘이 달리는 기운이야. 그래서 벌이지 말라고 한 거야.", yo: "챙길 것이 한꺼번에 늘어 힘이 달리는 기운이에요. 그래서 벌이지 말라고 한 거예요.", hao: "챙길 것이 한꺼번에 늘어 힘이 달리는 기운이오. 그래서 벌이지 말라 한 것이오." },
  },
  duty: {
    good: { ban: "맡은 걸 해내면 인정받는 기운이야. 그래서 피하지 말라고 한 거야.", yo: "맡은 걸 해내면 인정받는 기운이에요. 그래서 피하지 말라고 한 거예요.", hao: "맡은 것을 해내면 인정받는 기운이오. 그래서 피하지 말라 한 것이오." },
    care: { ban: "나를 누르는 힘이 센 때야. 그래서 무리하지 말라고 한 거야.", yo: "나를 누르는 힘이 센 때예요. 그래서 무리하지 말라고 한 거예요.", hao: "나를 누르는 힘이 센 때요. 그래서 무리하지 말라 한 것이오." },
  },
  resource: {
    good: { ban: "뒤에서 받쳐 주는 기운이 있어. 그래서 믿고 가라고 한 거야.", yo: "뒤에서 받쳐 주는 기운이 있어요. 그래서 믿고 가라고 한 거예요.", hao: "뒤에서 받쳐 주는 기운이 있소. 그래서 믿고 가라 한 것이오." },
    care: { ban: "생각이 많아지는 기운이야. 그래서 오늘 정하지 말라고 한 거야.", yo: "생각이 많아지는 기운이에요. 그래서 오늘 정하지 말라고 한 거예요.", hao: "생각이 많아지는 기운이오. 그래서 오늘 정하지 말라 한 것이오." },
  },
} satisfies Record<string, Record<"good" | "care", Record<Voice, string>>>;
const becauseGod = {
  비견: groupBecause.peer, 겁재: groupBecause.peer, 식신: groupBecause.output, 상관: groupBecause.output, 편재: groupBecause.wealth,
  정재: groupBecause.wealth, 편관: groupBecause.duty, 정관: groupBecause.duty, 편인: groupBecause.resource, 정인: groupBecause.resource,
};

export function answerFollowup(input: { character: AskCharacter; content: AskContent; topic: AskTopic; question: string; result: unknown; kind?: string; at?: number }) {
  const tone = voice[input.character];
  const read = askBasis(input.content, input.topic, input.result, input.question, input.kind);
  const flow = read.good ? "good" : "care";
  if (followWhy.test(input.question)) {
    // 첫 답에서 이미 한 말(read.line)은 되풀이하지 않는다. 덧붙일 근거가 없을 때만 다시 짚는다.
    const evidence = evidenceOf(input.content, input.topic, input.result, input.kind, input.at);
    if (!evidence) return `${read.line[tone]}\n${because[flow][tone]}`;
    const tail = evidence.god && Object.hasOwn(becauseGod, evidence.god) ? becauseGod[evidence.god as TenGodName][flow][tone] : because[flow][tone];
    return `${evidence.line[tone]}\n${tail}`;
  }
  if (followCare.test(input.question)) return `${careLead[tone]}\n${advice[input.topic].care[tone][seed(input.question) % 2]}`;
  return more[flow][tone][seed(input.question) % 2];
}
