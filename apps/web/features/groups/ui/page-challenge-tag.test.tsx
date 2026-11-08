// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const resource = vi.hoisted(() => ({ state: { status: "loading" } as { status: string; data?: unknown }, url: "" }));
vi.mock("@/features/rankings/ui/use-ranking-resource", () => ({ useRankingResource: (url: string) => { resource.url = url; return { state: resource.state }; } }));
vi.mock("@/features/rankings/ui/jjinfan-seed", () => ({ useJjinfanSeed: () => undefined }));

import { PageChallengeTag } from "./page-challenge-tag";

afterEach(cleanup);

it("tags a fan page whose 찐팬 100 challenge is on with the directory card's words, from the gauge's read", () => {
  resource.state = { status: "ready", data: { count: 12, target: 100, campaign: { endsOn: null, description: null } } };
  render(<PageChallengeTag slug="elina" locale="ko" />);
  expect(screen.getByText("찐팬 100 도전 중")).toBeVisible();
  expect(resource.url).toBe("/api/pages/elina/jjinfan-challenge");
});

it("draws nothing while loading or when the challenge is off", () => {
  resource.state = { status: "loading" };
  const { container, rerender } = render(<PageChallengeTag slug="elina" locale="ko" />);
  expect(container).toBeEmptyDOMElement();
  resource.state = { status: "ready", data: { count: 0, target: 100, campaign: null } };
  rerender(<PageChallengeTag slug="elina" locale="ko" />);
  expect(container).toBeEmptyDOMElement();
});
