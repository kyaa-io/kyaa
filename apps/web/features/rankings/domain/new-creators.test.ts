import { expect, it } from "vitest";
import { selectNewCreators } from "./new-creators";

const ranked = Array.from({ length: 10 }, (_, i) => ({ slug: String(i + 1) }));
const candidate = (slug: string) => ({ slug, name: slug });

it("keeps ten ranks when there are no eligible introductions", () => {
  expect(selectNewCreators(ranked, [candidate("1"), candidate("9")])).toEqual([]);
});

it("uses the tenth spot for one introduction outside the top nine", () => {
  expect(selectNewCreators(ranked, [candidate("9"), candidate("10")])).toEqual(
    [candidate("9"), candidate("10")],
  );
  expect(selectNewCreators(ranked, [candidate("10")])).toEqual([candidate("10")]);
});

it("uses the final two spots without duplicating the visible ranking", () => {
  expect(selectNewCreators(ranked, [candidate("8"), candidate("9"), candidate("new")])).toEqual(
    [candidate("9"), candidate("new")],
  );
});
