import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
it("returns the creator image with past draws and preserves the close-date filter", () => {
  const source = readFileSync(`${process.cwd()}/app/api/raffles/recent/route.ts`, "utf8");
  expect(source).toContain("image: creator.image.url");
  expect(source).toContain('=== "closed" && raffle.entryClosesAt');
});
