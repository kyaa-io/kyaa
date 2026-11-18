import { expect, it } from "vitest";
import { topicParticle, withTopic } from "./korean-particle";

it("picks 은 after a final consonant and 는 otherwise", () => {
  expect(withTopic("지난 기록")).toBe("지난 기록은");
  expect(withTopic("내일 운세")).toBe("내일 운세는");
  expect(withTopic("특별 부적 만들기")).toBe("특별 부적 만들기는");
  expect(withTopic("친구와 오늘")).toBe("친구와 오늘은");
  expect(topicParticle("A")).toBe("는");
});
