import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

function sources(dir: string, out: string[] = []) {
  for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    if (["node_modules", ".next", "e2e", "e2e-q"].includes(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(path);
  }
  return out;
}
const screens = ["components", "features", "app"].flatMap((dir) => sources(dir));
const outsideFanUi = screens.filter((file) => !file.startsWith("components/fan-ui/"));

/** 관리자 폼의 이름 붙은 입력칸(네이티브 제출용 `<select>`)은 정렬·필터 알약이 아니라 폼 필드라서 이 계약 밖이다. */
const ADMIN_FORM_FIELDS = ["components/admin/", "features/support/"];
/** 최애 고르기 메뉴는 정렬·필터가 아니라 대상을 고르는 목록이라 계약 밖이다. */
const PICKER_MENUS = ["features/selected-bias/ui/selected-bias-chip.tsx"];

describe("FanSelectMenu: the one sort/filter dropdown", () => {
  const css = read("components/fan-ui/fan-select-menu.module.css");

  it("keeps the pill height, side padding, label-to-arrow gap and menu min width in one place, on tokens", () => {
    const pill = /\.pill \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(pill).toMatch(/height: 36px/);
    expect(pill).toMatch(/gap: var\(--space-1\)/);
    expect(pill).toMatch(/padding: 0 var\(--space-3\) 0 var\(--space-4\)/);
    expect(pill).toMatch(/border-radius: var\(--radius-pill\)/);
    expect(pill).toMatch(/border: 1px solid var\(--color-line\)/);
    expect(css).toMatch(/\.menu \{ min-width: max\(var\(--anchor-width\), 160px\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("draws the menu with FanMenu radio items so row height, padding and the check position are shared", () => {
    const source = read("components/fan-ui/fan-select-menu.tsx");
    expect(source).toContain("<FanMenu.Radio");
    expect(source).toContain("closeOnSelect");
  });

  it.each([
    "features/groups/ui/directory-top.tsx",
    "features/groups/ui/group-directory.tsx",
    "features/groups/ui/group-board.tsx",
    "components/celebrity-directory.tsx",
    "features/analytics/ui/performance-table.tsx",
  ])("%s uses FanSelectMenu for its sort or filter dropdown", (file) => {
    expect(read(file)).toContain("<FanSelectMenu");
  });

  it("allows no screen to rebuild a radio menu or its pill outside fan-ui", () => {
    const offenders = outsideFanUi.filter((file) => !PICKER_MENUS.includes(file) && /Menu\.Radio(Group|Item)/.test(read(file)));
    expect(offenders.map((file) => relative(root, resolve(root, file)))).toEqual([]);
  });

  it("allows no native <select> named for sorting or filtering outside admin forms", () => {
    const offenders: string[] = [];
    for (const file of outsideFanUi) {
      if (ADMIN_FORM_FIELDS.some((prefix) => file.startsWith(prefix))) continue;
      for (const tag of read(file).matchAll(/<select\b(?:[^>]|=>)*>/g)) if (/sort|filter/i.test(tag[0])) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
