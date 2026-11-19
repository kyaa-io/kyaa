import { expect, it, vi } from "vitest";
vi.mock("@/features/chemi/ui/my-birth/my-birth-shortcut-detail", () => ({ MyBirthShortcutDetail: () => null }));
import { withBirthShortcut } from "./my-screen";
import type { MyShortcut } from "./my-shortcuts";

const base: MyShortcut[] = ["favorites", "activity", "raffles", "logout"].map((key) => ({ key, href: `/${key}`, label: key, art: key }));

it("puts 내 생일 정보 right after 활동 내역 only where the chemi tab is open", () => {
  expect(withBirthShortcut(base, "ko", false)).toBe(base);
  const items = withBirthShortcut(base, "ko", true);
  expect(items.map((item) => item.key)).toEqual(["favorites", "activity", "birth", "raffles", "logout"]);
  expect(items[2]).toMatchObject({ label: "내 생일 정보", href: "/my/birth?locale=ko", art: "birth" });
});
