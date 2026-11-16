import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FanNumUnit } from "./fan-num-unit";

const css = readFileSync(resolve(process.cwd(), "components/fan-ui/fan-num-unit.module.css"), "utf8");

describe("FanNumUnit", () => {
  it("keeps the number and unit in one nowrap element", () => {
    const html = renderToStaticMarkup(<FanNumUnit>{"1,234,567"}{"명"}</FanNumUnit>);
    expect(html).toContain("data-num-unit");
    expect(html).toContain("1,234,567");
    expect(html).toContain("명");
    expect(css).toMatch(/white-space:\s*nowrap/);
  });
});
