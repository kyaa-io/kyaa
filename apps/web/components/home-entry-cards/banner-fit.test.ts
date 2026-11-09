import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("components/home-entry-cards/managed-home-banner.module.css", "utf8");

describe("home banner artwork fit", () => {
  it("contains guide artwork while keeping the default photo fit as cover", () => {
    expect(css).toMatch(/\.artwork img\s*\{[^}]*object-fit:\s*cover/);
    expect(css).toMatch(/\[data-guide-art\] \.artwork img\s*\{[^}]*object-fit:\s*contain/);
  });
});
