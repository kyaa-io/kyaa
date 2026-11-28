import { APP_LOCALES } from "@/i18n/locales";
import styles from "./fan-app-shell.module.css";
import { PersistentFanLayout, usesPersistentFanLayout } from "./persistent-fan-layout";
import { GroupsReleaseProvider } from "@/features/groups/ui/groups-release";
import { ChemiReleaseProvider } from "@/features/chemi/ui/chemi-release";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  activeFanSection,
  FanAppFrame,
  FanContentContainer,
  fanNavigationItems,
  localeSwitchHref,
} from "./fan-app-shell";

let pathname = "/";
let search = "";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
  useSelectedLayoutSegments: () => pathname.split("/").filter(Boolean),
  useSearchParams: () => new URLSearchParams(search),
}));

describe("fan app shell navigation", () => {
  it.each(['/benefits','/benefits/real-benefit','/my/capsules'])('keeps %s in global benefits only when released', path => {
    expect(fanNavigationItems('ko',path,true).filter(item=>item.isCurrent).map(item=>item.id)).toEqual(['favorites']);
    expect(fanNavigationItems('ko',path,false).filter(item=>item.isCurrent).map(item=>item.id)).toEqual(['my']);
  });
  it('names the 덕질 tab 굿즈 only when the goods switch is on',()=>{
    expect(fanNavigationItems('ko','/',true,false,true).find(item=>item.id==='favorites')?.label).toBe('굿즈');
    expect(fanNavigationItems('ko','/',true).find(item=>item.id==='favorites')?.label).toBe('덕질');
  });
  it('does not match look-alike benefit paths',()=>{
    expect(fanNavigationItems('ko','/benefits-other',true).find(item=>item.id==='favorites')?.isCurrent).toBe(false);
  });
  beforeEach(() => {
    pathname = "/";
    search = "";
    window.history.replaceState(null, "", "/");
  });

  it.each([
    ["/", "home"],
    ["/events", "home"],
    ["/community", "community"],
    ["/live", "favorites"],
    ["/live/kara-byus-live", "favorites"],
    ["/celebrities", "favorites"],
    ["/c/kara", "favorites"],
    ["/kyaa-wave-fanpage/programs/wave-quiz", "favorites"],
    ["/bias/requests", "favorites"],
    ["/my", "my"],
    ["/passports", "my"],
    ["/benefits", "my"],
    ["/notifications", "my"],
    ["/settings", "my"],
  ])("maps %s to %s", (pathname, expected) => {
    expect(activeFanSection(pathname)).toBe(expected);
  });

  it("uses the same four destinations in Korean and English", () => {
    expect(fanNavigationItems("ko", "/community").map(({ id, href, label, isCurrent }) => ({
      id,
      href,
      label,
      isCurrent,
    }))).toEqual([
      { id: "home", href: "/?locale=ko", label: "HOME", isCurrent: false },
      { id: "community", href: "/pages/groups?locale=ko", label: "커뮤니티", isCurrent: true },
      { id: "favorites", href: "/celebrities?locale=ko", label: "최애", isCurrent: false },
      { id: "my", href: "/my?locale=ko", label: "MY", isCurrent: false },
    ]);
    expect(fanNavigationItems("en", "/").map((item) => item.label)).toEqual([
      "HOME",
      "Community",
      "FAVORITES",
      "MY",
    ]);
  });

  it("has no chemi tab while CHEMI_TAB is off, in the header data and in the rendered bars", () => {
    for (const groups of [false, true]) expect(fanNavigationItems("ko", "/", groups).map((item) => item.id)).not.toContain("chemi");
    render(<GroupsReleaseProvider enabled><FanAppFrame locale="ko"><main>본문</main></FanAppFrame></GroupsReleaseProvider>);
    expect(document.querySelector('[data-fan-navigation-id="chemi"]')).toBeNull();
  });
  it("orders the tabs HOME · 모임 · 케미 · 덕질 · MY when CHEMI_TAB is on", () => {
    expect(fanNavigationItems("ko", "/", true, true).map((item) => item.id)).toEqual(["home", "community", "chemi", "favorites", "my"]);
    expect(fanNavigationItems("ko", "/", false, true).map((item) => item.id)).toEqual(["home", "community", "chemi", "favorites", "my"]);
    expect(fanNavigationItems("ko", "/chemi", true, true).find((item) => item.id === "chemi")).toMatchObject({ label: "케미", isCurrent: true });
    expect(fanNavigationItems("ja", "/", true, true).find((item) => item.id === "chemi")).toMatchObject({ label: "ケミ", href: "/chemi?locale=ja" });
  });
  it("marks only the chemi tab current on /chemi and keeps home out of it", () => {
    expect(activeFanSection("/chemi")).toBe("chemi");
    expect(fanNavigationItems("ko", "/chemi", true, true).filter((item) => item.isCurrent).map((item) => item.id)).toEqual(["chemi"]);
    expect(fanNavigationItems("ko", "/", true, true).find((item) => item.id === "chemi")?.isCurrent).toBe(false);
  });
  it("draws five tabs in the header and the bottom bar when the release context is on", () => {
    render(<GroupsReleaseProvider enabled><ChemiReleaseProvider enabled><FanAppFrame locale="ko"><main>본문</main></FanAppFrame></ChemiReleaseProvider></GroupsReleaseProvider>);
    const ids = [...document.querySelectorAll("[data-fan-navigation-id]")].map((node) => node.getAttribute("data-fan-navigation-id"));
    expect(ids).toEqual(["home", "community", "chemi", "favorites", "my", "home", "community", "chemi", "favorites", "my"]);
  });

  it("uses English navigation on the English raffle landing", () => {
    expect(fanNavigationItems("en", "/s/raffle", true, true).map((item) => item.label))
      .toEqual(["HOME", "Groups", "Chemi", "FAVORITES", "MY"]);
  });

  it("uses the same localized desktop and mobile menu labels in every supported language", () => {
    const groups = { ko: "모임", en: "Groups", ja: "グループ", mn: "Groups", "zh-Hans": "群组",
      "zh-Hant": "群組", es: "Grupos", id: "Grup", vi: "Nhóm", th: "กลุ่ม", pt: "Grupos", fr: "Groupes", ru: "Группы" };
    for (const locale of APP_LOCALES) {
      render(
        <GroupsReleaseProvider enabled>
          <ChemiReleaseProvider enabled>
            <FanAppFrame locale={locale}><main /></FanAppFrame>
          </ChemiReleaseProvider>
        </GroupsReleaseProvider>,
      );
      const menus = screen.getAllByRole("navigation").filter((menu) =>
        menu.querySelector("[data-fan-navigation-id]"),
      );
      const expected = ["HOME", groups[locale], { ko: "케미", ja: "ケミ" }[locale as "ko" | "ja"] ?? "Chemi", "덕질", "MY"];
      expect(menus.map((menu) => within(menu).getAllByRole("link").map((link) => link.textContent)), locale)
        .toEqual([expected, expected]);
      cleanup();
    }
  });

  it("derives the active destination from the current route on the first render", () => {
    pathname = "/live/kara-byus-live";
    search = "locale=ko";

    render(
      <FanAppFrame locale="ko">
        <main>LIVE 본문</main>
      </FanAppFrame>,
    );

    const currentLinks = screen
      .getAllByRole("link", { name: "최애" })
      .filter((link) => link.hasAttribute("aria-current"));
    expect(currentLinks).toHaveLength(2);
    for (const current of currentLinks) {
      expect(current).toHaveAttribute("aria-current", "page");
    }
    expect(screen.getAllByRole("link", { name: "HOME" })[0]).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps home active in the events catalog", () => {
    pathname = "/events";
    render(<FanAppFrame locale="ko" currentPath="/events"><main>이벤트 목록</main></FanAppFrame>);
    expect(screen.getByRole("link", { name: "홈", current: "page" })).toBeVisible();
    expect(screen.getByRole("link", { name: "HOME", current: "page" })).toBeVisible();
    for (const link of screen.getAllByRole("link", { name: "최애" })) expect(link).not.toHaveAttribute("aria-current");
  });

  it("changes only locale while preserving route query and hash", () => {
    expect(
      localeSwitchHref(
        "/c/kara",
        "tab=notice&locale=ko&source=home",
        "en",
        "#latest",
      ),
    ).toBe("/c/kara?tab=notice&locale=en&source=home#latest");
  });

  it("retains a nested screen when its selected navigation section is overridden", async () => {
    pathname = "/my/activity";
    search = "kind=collection&locale=ko";
    render(<FanAppFrame locale="ko" currentPath="/my"><main>Activity</main></FanAppFrame>);
    fireEvent.click(screen.getByRole("combobox", { name: "언어 선택, 현재 한국어" }));
    const english = await screen.findByRole("option", { name: "English" });
    fireEvent.pointerDown(english, { button: 0, pointerType: "mouse" });
    fireEvent.click(english);
    expect(push).toHaveBeenCalledWith("/my/activity?kind=collection&locale=en");
  });

  it.each([["ko", "알림"], ["en", "Notifications"], ["ja", "通知"]] as const)("makes notifications reachable from the %s header", (locale, label) => {
    render(<FanAppFrame locale={locale}><main>Content</main></FanAppFrame>);
    expect(within(screen.getByRole("banner")).getByRole("link", { name: label })).toHaveAttribute("href", `/notifications?locale=${locale}`);
  });

  it("preserves non-locale query parameters in the rendered language action", () => {
    pathname = "/c/kara";
    search = "tab=benefits&locale=ko&source=home";

    render(
      <FanAppFrame locale="ko">
        <main>혜택 본문</main>
      </FanAppFrame>,
    );

    const languageAction = screen.getByRole("combobox", { name: "언어 선택, 현재 한국어" });
    expect(languageAction).toHaveValue("ko");
    expect(localeSwitchHref("/c/kara", "tab=benefits&locale=ko&source=home", "ja")).toBe("/c/kara?tab=benefits&locale=ja&source=home");
    expect(languageAction).toHaveAttribute("data-fan-language-action");
  });

  it("connects an optional skip link to the screen main landmark", () => {
    render(
      <FanAppFrame locale="ko" mainId="screen-main">
        <main id="screen-main" tabIndex={-1}>화면 본문</main>
      </FanAppFrame>,
    );

    expect(screen.getByRole("link", { name: "본문으로 바로가기" })).toHaveAttribute(
      "href",
      "#screen-main",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "screen-main");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("main").closest("[data-fan-surface]")).toHaveAttribute(
      "lang",
      "ko",
    );
  });

  it("uses one shared content-container contract for header, main, and footer", () => {
    render(
      <FanAppFrame locale="ko" mainId="screen-main">
        <FanContentContainer as="main" id="screen-main">
          화면 본문
        </FanContentContainer>
      </FanAppFrame>,
    );

    expect(screen.getByRole("banner").firstElementChild).toHaveAttribute(
      "data-fan-content-container",
    );
    expect(screen.getByRole("main")).toHaveAttribute(
      "data-fan-content-container",
    );

    const footerContainers = screen
      .getByRole("contentinfo")
      .querySelectorAll("[data-fan-content-container]");
    expect(footerContainers).toHaveLength(3);
  });
});

 it("switches existing pages and their footer together only under the server release gate", () => {
   pathname = "/community";
   render(<GroupsReleaseProvider enabled><FanAppFrame locale="ko"><main>본문</main></FanAppFrame></GroupsReleaseProvider>);
   const groupLinks=screen.getAllByRole("link",{name:"모임"});
   expect(groupLinks.length).toBeGreaterThanOrEqual(3);
   for(const link of groupLinks)expect(link).toHaveAttribute("href","/pages/groups?locale=ko");
   for(const link of screen.getAllByRole("link",{name:"덕질"}))expect(link).toHaveAttribute("href","/benefits?locale=ko");
 });

 it("scopes Pencil shell geometry to the enabled release and honors an explicit gate-off", () => {
   const { rerender } = render(<GroupsReleaseProvider enabled><FanAppFrame locale="ko"><main>본문</main></FanAppFrame></GroupsReleaseProvider>);
   expect(screen.getByRole("main").closest("[data-fan-surface]")).toHaveClass(styles.groupsNavigation);
   expect(screen.getByRole("banner")).toHaveClass(styles.groupsNavigation);
   expect(screen.getByRole("navigation", { name: "모바일 주요 메뉴" })).toHaveClass(styles.groupsNavigation);
   rerender(<GroupsReleaseProvider enabled><FanAppFrame locale="ko" groupsEnabled={false}><main>본문</main></FanAppFrame></GroupsReleaseProvider>);
   expect(screen.getByRole("main").closest("[data-fan-surface]")).not.toHaveClass(styles.groupsNavigation);
   expect(screen.getByRole("banner")).not.toHaveClass(styles.groupsNavigation);
   expect(screen.getByRole("navigation", { name: "모바일 주요 메뉴" })).not.toHaveClass(styles.groupsNavigation);
   for (const link of screen.getAllByRole("link", { name: "최애" })) expect(link).toHaveAttribute("href", "/celebrities?locale=ko");
 });

 it('keeps a group fan page under Groups even when the local preview is served at root',()=>{
  pathname='/';
  render(<FanAppFrame locale="ko" groupsEnabled currentPath="/pages/groups"><div>팬페이지 홈</div></FanAppFrame>);
  for(const link of screen.getAllByRole('link',{name:'모임'}))expect(link).toHaveAttribute('aria-current','page');
  for(const label of ['HOME','최애'])for(const link of screen.getAllByRole('link',{name:label}))expect(link).not.toHaveAttribute('aria-current');
 });

describe("persistent fan layout", () => {
  it.each(APP_LOCALES)("keeps the header and tabs through the main fan journey in %s", (locale) => {
    pathname = "/";
    search = `locale=${locale}`;
    const view = (id: string) => (
      <GroupsReleaseProvider enabled>
        <ChemiReleaseProvider enabled>
          <PersistentFanLayout>
            <FanAppFrame key={id} locale={locale} mainId={id}><main id={id} tabIndex={-1} /></FanAppFrame>
          </PersistentFanLayout>
        </ChemiReleaseProvider>
      </GroupsReleaseProvider>
    );
    const result = render(view("home-main"));
    const header = screen.getByRole("banner");
    const [desktopNav, mobileNav] = screen.getAllByRole("navigation").filter(nav => nav.querySelector("[data-fan-navigation-id]"));
    expect(desktopNav).toBeDefined();
    expect(mobileNav).toBeDefined();
    for (const [index, path] of ["/pages/groups", "/changha", "/c/changha/community/post", "/notices/notice", "/chemi", "/my"].entries()) {
      pathname = path;
      const id = `screen-${index}`;
      result.rerender(view(id));
      expect(screen.getByRole("banner")).toBe(header);
      expect(header.contains(desktopNav)).toBe(true);
      expect(mobileNav.isConnected).toBe(true);
      fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="#fan-route-content"]')!);
      expect(document.activeElement).toBe(document.getElementById(id));
    }
  });

  it("preserves the current fragment when changing locale after navigation", async () => {
    pathname = "/";
    search = "locale=ko";
    window.history.replaceState(null, "", "/?locale=ko#home");
    const view = render(<PersistentFanLayout><main /></PersistentFanLayout>);
    pathname = "/notices";
    search = "locale=ko&page=2";
    window.history.replaceState(null, "", "/notices?locale=ko&page=2#recent");
    view.rerender(<PersistentFanLayout><main /></PersistentFanLayout>);

    fireEvent.click(screen.getByRole("combobox", { name: "언어 선택, 현재 한국어" }));
    const english = await screen.findByRole("option", { name: "English" });
    fireEvent.pointerDown(english, { button: 0, pointerType: "mouse" });
    fireEvent.click(english);
    expect(push).toHaveBeenCalledWith("/notices?locale=en&page=2#recent");
  });

  it("places the notification action inside the persistent header", () => {
    pathname = "/notifications";
    search = "";
    render(
      <PersistentFanLayout>
        <FanAppFrame locale="ko" actions={<button>Notification settings</button>}><main /></FanAppFrame>
      </PersistentFanLayout>
    );
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Notification settings" })).toBeTruthy();
  });

  it.each(["/login", "/share/chemi", "/s/opaque-token", "/admin", "/operator", "/chemi/games/run"])("keeps %s outside the fan layout", (path) => {
    expect(usesPersistentFanLayout(path, true, true)).toBe(false);
  });
});
