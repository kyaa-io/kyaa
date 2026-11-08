// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const dukjil = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/features/dukjil/ui/dukjil-provider", () => ({ useDukjil: () => dukjil.value }));
vi.mock("@/features/dukjil/domain/dukjil-ui", () => ({ todayItem: (today: { actions?: Record<string, unknown> } | undefined, action: string) => today?.actions?.[action] }));
vi.mock("@/features/dukjil/ui/earn-badge", () => ({ EarnActionBadge: ({ action, variant }: { action: string; variant: string }) => <span data-earn={action} data-variant={variant} /> }));
vi.mock("@/components/notice/notice-share", () => ({ NoticeShare: () => <button type="button">공유</button> }));

import { PostShareAction, shareBadgeVisible } from "./post-share-action";

afterEach(cleanup);
const catalog = { rules: { share: { points: 10 } } };

it("puts the share mission's corner badge on the share button for a fan who can still earn it today", () => {
  dukjil.value = { authenticated: true, catalog, today: { actions: { share: { remaining: 1 } } } };
  const { container } = render(<PostShareAction title="글" locale="ko" />);
  const badge = container.querySelector("[data-earn]");
  expect(badge?.getAttribute("data-earn")).toBe("share");
  expect(badge?.getAttribute("data-variant")).toBe("corner");
  expect(container.querySelector("button")?.textContent).toBe("공유");
});

it("shows no badge without a share mission, after today's share is earned, or before today is known", () => {
  expect(shareBadgeVisible(null)).toBe(false);
  expect(shareBadgeVisible({ authenticated: true, catalog: { rules: {} }, today: undefined } as never)).toBe(false);
  expect(shareBadgeVisible({ authenticated: true, catalog, today: { actions: { share: { remaining: 0 } } } } as never)).toBe(false);
  expect(shareBadgeVisible({ authenticated: true, catalog, today: undefined } as never)).toBe(false);
  expect(shareBadgeVisible({ authenticated: false, catalog, today: undefined } as never)).toBe(true);
});
