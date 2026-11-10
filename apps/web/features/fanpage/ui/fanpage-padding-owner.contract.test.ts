import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const fanpage = read("features/fanpage/ui/fanpage.module.css");
const groups = read("features/groups/ui/groups.module.css");

// #celebrity-detail-main carries fanpage .page together with groups .creatorPage or groups .page.
// At equal specificity the later CSS chunk wins, and chunk order moves whenever many CSS files change
// (design-sync-1 review-1: the fan page head moved up 24px at 1440). The groups module owns the top padding.
describe("fan page main top padding owner", () => {
  it("keeps fanpage .page padding at zero specificity so the groups module always wins", () => {
    for (const [, body] of fanpage.matchAll(/(?:^|[}\s])\.page\s*\{([^}]*)\}/g)) expect(body).not.toMatch(/padding(-top|-block)?\s*:/);
    expect(fanpage).toContain(":where(.page){padding-top:8px;padding-bottom:64px}");
    expect(fanpage).toContain(":where(.page){padding-top:4px;padding-bottom:40px}");
  });

  it("keeps the creator page top padding at 32 (1440) and 16 (below 768)", () => {
    expect(groups).toMatch(/\.creatorPage \{[^}]*padding-top:32px/);
    expect(groups).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[^@]*\.creatorPage\{padding-top:16px\}/);
  });

  it("uses fanpage .page and a groups class on the same main in both frames", () => {
    expect(read("components/celebrity-fan-page.tsx")).toMatch(/id="celebrity-detail-main" className=\{`\$\{styles\.page\} \$\{groupsEnabled \? \(isBrand \? groupStyles\.page : groupStyles\.creatorPage\)/);
    expect(read("features/groups/ui/group-page-frame.tsx")).toMatch(/id="celebrity-detail-main" className=\{`\$\{fanpageStyles\.page\} \$\{brand \? styles\.page : styles\.creatorPage\}`\}/);
  });
});

// review-2 (2026-11-09): lowering `.slide .copy p` to :where(.copy) p let groups `.page p{line-height:1.5}` win, so the
// carousel blurb became 19.5px instead of 18px below 1024px. The 18px rule keeps its own specificity.
describe("groups discovery carousel blurb line height", () => {
  it("keeps the below-1024 blurb at 18px on `.slide .copy p`", () => {
    expect(read("features/groups/ui/discovery-carousel.module.css")).toMatch(/@media\(max-width:1023px\)\{[^@]*\.slide \.copy p\{font-size:var\(--fan-metadata-size\);line-height:18px\}/);
  });
});
