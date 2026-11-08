import styles from "./fan-app-shell.module.css";
import { GroupsReleaseProvider } from "@/features/groups/ui/groups-release";
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
  useSearchParams: () => new URLSearchParams(search),
}));

describe("fan app shell navigation", () => {
  it.each(['/benefits','/benefits/real-benefit','/my/capsules'])('keeps %s in global benefits only when released', path => {
    expect(fanNavigationItems('ko',path,true).filter(item=>item.isCurrent).map(item=>item.id)).toEqual(['favorites']);
    expect(fanNavigationItems('ko',path,false).filter(item=>item.isCurrent).map(item=>item.id)).toEqual(['my']);
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
      { id: "community", href: "/community?locale=ko", label: "커뮤니티", isCurrent: true },
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

 it("5차 셸: the released header is 56px text tabs (no icons) + bell + account, the 390 tab bar has lucide icons, and the gate-off keeps the old shell", () => {
   pathname = "/";
   const { rerender, container } = render(<GroupsReleaseProvider enabled><FanAppFrame locale="ko"><main>본문</main></FanAppFrame></GroupsReleaseProvider>);
   expect(screen.getByRole("main").closest("[data-fan-surface]")).toHaveClass(styles.groupsNavigation);
   const header = screen.getByRole("banner");
   expect(header).toHaveAttribute("data-fan-header");
   expect(header).toHaveClass(styles.shellHeader);
   const tabs = header.querySelector("[data-shell-tabs]")!;
   expect([...tabs.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["HOME", "모임", "덕질", "MY"]);
   expect(tabs.querySelectorAll("svg")).toHaveLength(0);
   expect(tabs.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
   expect(header.querySelector("[data-shell-location]")?.textContent).toBe("홈");
   expect(header.textContent).not.toMatch(/\d/);
   const bar = container.querySelector("[data-bottom-nav]")!;
   expect(bar).toHaveClass(styles.tabbar);
   expect(bar.querySelectorAll('svg[data-icon-set="lucide"][stroke-width="1.5"]')).toHaveLength(4);
   rerender(<GroupsReleaseProvider enabled><FanAppFrame locale="ko" groupsEnabled={false}><main>본문</main></FanAppFrame></GroupsReleaseProvider>);
   expect(screen.getByRole("main").closest("[data-fan-surface]")).not.toHaveClass(styles.groupsNavigation);
   expect(screen.getByRole("banner")).not.toHaveAttribute("data-fan-header");
   for (const link of screen.getAllByRole("link", { name: "최애" })) expect(link).toHaveAttribute("href", "/celebrities?locale=ko");
 });

 it("names the place: 덕질 on /benefits, a screen-given name (fan page) wins and shows on 390 too", () => {
   render(<FanAppFrame locale="ko" groupsEnabled currentPath="/benefits"><main>본문</main></FanAppFrame>);
   expect(screen.getByRole("banner").querySelector("[data-shell-location]")?.textContent).toBe("덕질");
   cleanup();
   render(<FanAppFrame locale="ko" groupsEnabled currentPath="/elina" locationName="엘리나"><main>본문</main></FanAppFrame>);
   const place = screen.getByRole("banner").querySelector("[data-shell-location]")!;
   expect(place.textContent).toBe("엘리나");
   expect(place).toHaveAttribute("data-named");
 });

 it('keeps a group fan page under Groups even when the local preview is served at root',()=>{
  pathname='/';
  render(<FanAppFrame locale="ko" groupsEnabled currentPath="/pages/groups"><div>팬페이지 홈</div></FanAppFrame>);
  for(const link of screen.getAllByRole('link',{name:'모임'}))expect(link).toHaveAttribute('aria-current','page');
  for(const label of ['HOME','최애'])for(const link of screen.getAllByRole('link',{name:label}))expect(link).not.toHaveAttribute('aria-current');
 });
