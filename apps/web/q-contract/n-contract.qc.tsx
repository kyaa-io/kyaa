// 261107-2 기계 규칙 중 실행해서 보는 단위 계약: N5 N13 N17 N18 (원문 board/reports/doc-261107-2-review-rules.md 2절).
// 구현 묶음의 컴포넌트가 아직 없으면 시험 이름 그대로 "미구현"으로 실패한다. props 이름은 규칙 원문에서 가져온 가정이며,
// 구현이 다른 이름을 쓰면 아래 PROPS 한 곳만 고친다(계약 내용은 바꾸지 않는다).
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ComponentType } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const ROOT = process.cwd(); // npm run test:qc 는 apps/web 에서 돈다
async function load<T = Record<string, unknown>>(rel: string): Promise<T> {
  const found = ["", ".tsx", ".ts"].map((ext) => resolve(ROOT, rel + ext)).find((p) => existsSync(p));
  if (!found) expect.fail(`미구현: ${rel} 파일이 없다`);
  return (await import(/* @vite-ignore */ found)) as T;
}

const PROPS = {
  // 제목만 받는 접기는 FanDisclosure(label)다. FanCollapsible 은 trigger 렌더 함수를 받는 하위 부품이다.
  collapsible: { component: "FanDisclosure", open: "defaultOpen", title: "label" },
  headerStatus: { grade: "grade", favorite: "favorite", completed: "completedMissions", total: "totalMissions" },
};
// 헤더 상태 3칸은 설계 문서의 components/fan-shell/fan-header-status 가 아니라 헤더 최애 칩의 표시부로 구현됐다(같은 역할, 경로·이름만 다름).
const HEADER_STATUS = { path: "features/selected-bias/ui/selected-bias-chip", name: "SelectedBiasStatus" } as const;
const loadHeaderStatus = async () => {
  const mod = await load<Record<string, ComponentType<Record<string, unknown>> | undefined>>(HEADER_STATUS.path);
  const C = mod[HEADER_STATUS.name];
  if (!C) expect.fail(`미구현: ${HEADER_STATUS.path} 에 ${HEADER_STATUS.name} 내보내기가 없다`);
  return C;
};
// 숫자와 단위가 다른 span 이어도 화면에는 한 덩어리로 보인다. 그 덩어리를 가장 안쪽 요소의 textContent 로 찾는다.
const shownText = (text: string) => screen.getByText((_, el) => el?.textContent === text && Array.from(el.children).every((child) => child.textContent !== text));

describe("N5 FanCollapsible 기본 상태", () => {
  it("N5: 오늘 할 것은 열려 있고 완료·미래는 닫혀 있으며 토글 뒤 재렌더에서도 유지된다", async () => {
    const mod = await load<Record<string, ComponentType<Record<string, unknown>> | undefined>>("components/fan-ui/fan-collapsible");
    const C = mod[PROPS.collapsible.component];
    if (!C) expect.fail(`미구현: fan-collapsible 에 ${PROPS.collapsible.component} 내보내기가 없다`);
    const view = () => (
      <>
        <div data-testid="today"><C {...{ [PROPS.collapsible.open]: true, [PROPS.collapsible.title]: "오늘" }}><p>오늘 미션</p></C></div>
        <div data-testid="done"><C {...{ [PROPS.collapsible.title]: "완료" }}><p>완료 미션</p></C></div>
        <div data-testid="future"><C {...{ [PROPS.collapsible.title]: "예정" }}><p>예정 미션</p></C></div>
      </>
    );
    const { rerender, container } = render(view());
    const state = (id: string) => container.querySelector(`[data-testid="${id}"] [data-state]`)?.getAttribute("data-state");
    expect(state("today")).toBe("open");
    expect(state("done")).toBe("closed");
    expect(state("future")).toBe("closed");
    fireEvent.click(screen.getByRole("button", { name: /완료/ }));
    expect(state("done")).toBe("open");
    rerender(view());
    expect(state("done")).toBe("open");
    expect(state("today")).toBe("open");
  });
});

describe("N13 비동기 버튼의 3상태", () => {
  it("N13: FanAction 대기 중에는 aria-busy 를 갖고 글자를 유지하며 누를 수 없다", async () => {
    const { FanAction } = await load<{ FanAction: ComponentType<Record<string, unknown>> }>("components/fan-ui/fan-action");
    const onClick = vi.fn();
    const { rerender } = render(<FanAction onClick={onClick}>저장</FanAction>);
    const idle = screen.getByRole("button", { name: "저장" });
    expect(idle).not.toHaveAttribute("aria-busy");
    // 규칙 원문의 prop 은 pending, 현재 구현은 loading 이다. 둘 다 넘겨서 어느 쪽이든 같은 계약을 본다.
    rerender(<FanAction onClick={onClick} {...{ pending: true, loading: true }}>저장</FanAction>);
    const busy = screen.getByRole("button", { name: /저장/ });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("N13: 실패는 FanState inline 이 role=alert 로 사유를 보이고 다시 시도 행동을 가진다", async () => {
    const { FanState } = await load<{ FanState: ComponentType<Record<string, unknown>> }>("components/fan-ui/fan-state");
    const { FanAction } = await load<{ FanAction: ComponentType<Record<string, unknown>> }>("components/fan-ui/fan-action");
    const retry = vi.fn();
    render(<FanState kind="error" inline title="저장하지 못했어요" description="네트워크가 끊겼어요" actions={<FanAction onClick={retry}>다시 시도</FanAction>} />);
    expect(screen.getByRole("alert")).toHaveTextContent("저장하지 못했어요");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("N17 헤더 상태 3칸", () => {
  const props = (over: Record<string, unknown> = {}) => ({
    locale: "ko",
    [PROPS.headerStatus.grade]: "골드",
    [PROPS.headerStatus.favorite]: "엘리나",
    [PROPS.headerStatus.completed]: 3,
    [PROPS.headerStatus.total]: 4,
    ...over,
  });
  it("N17: 등급·최애·온도 3칸이고 온도는 완료 3/4 → 75°", async () => {
    const FanHeaderStatus = await loadHeaderStatus();
    render(<FanHeaderStatus {...props()} />);
    expect(screen.getByText("골드")).toBeInTheDocument();
    expect(screen.getByText("엘리나")).toBeInTheDocument();
    expect(shownText("75°")).toBeInTheDocument();
  });
  it("N17: 최애가 없으면 온도 칸이 없다", async () => {
    const FanHeaderStatus = await loadHeaderStatus();
    const { container } = render(<FanHeaderStatus {...props({ [PROPS.headerStatus.favorite]: null })} />);
    expect(container.textContent).not.toMatch(/\d+°/);
  });
  it("N17: 값이 바뀔 때만 data-pulse 가 한 번 붙고 이후 제거된다", async () => {
    const FanHeaderStatus = await loadHeaderStatus();
    const { container, rerender } = render(<FanHeaderStatus {...props()} />);
    expect(container.querySelector("[data-pulse]")).toBeNull();
    rerender(<FanHeaderStatus {...props({ [PROPS.headerStatus.completed]: 4 })} />);
    expect(container.querySelector("[data-pulse]")).not.toBeNull();
    expect(shownText("100°")).toBeInTheDocument();
    // 브라우저는 animationend 로 바로 뗀다. jsdom 에는 AnimationEvent 가 없어 React 가 이 이벤트를 받지 않으므로, 연출 시간(400ms) 안에 떨어지는지 본다.
    fireEvent.animationEnd(container.querySelector("[data-pulse]") as Element);
    await waitFor(() => expect(container.querySelector("[data-pulse]")).toBeNull(), { timeout: 1000 });
  });
});

describe("N18 0값 통계와 빈 소개는 자리를 차지하지 않는다", () => {
  const data = (online: number, today: number) => ({ data: { onlineCount: online, todayCount: today, artists: [] }, error: null, retry: vi.fn() });
  it("N18: 지금 접속·오늘 방문이 모두 0이면 그 칸이 없다", async () => {
    vi.resetModules();
    vi.doMock("@/features/groups/ui/use-group-presence", () => ({ useGroupPresence: () => data(0, 0) }));
    const { GroupPresence } = await import("@/features/groups/ui/group-presence");
    const { container } = render(<GroupPresence pageId="p" locale="ko" memberCount={12} />);
    expect(container.textContent).not.toMatch(/지금 접속|오늘 방문/);
  });
  it("N18: 값이 있으면 보인다", async () => {
    vi.resetModules();
    vi.doMock("@/features/groups/ui/use-group-presence", () => ({ useGroupPresence: () => data(3, 9) }));
    const { GroupPresence } = await import("@/features/groups/ui/group-presence");
    const { container } = render(<GroupPresence pageId="p" locale="ko" memberCount={12} />);
    expect(container.textContent).toMatch(/지금 접속/);
    expect(container.textContent).toMatch(/오늘 방문/);
  });
  it("N18: 소개가 없으면 소개 줄이 렌더되지 않는다", async () => {
    const { FanPageHeader } = await import("@/components/fan-ui/fan-page-header");
    const { container } = render(<FanPageHeader image={{ src: null, alt: "" } as never} name="엘리나" kind="fan" locale="ko" />);
    expect(container.querySelector("header p")).toBeNull();
  });
});
