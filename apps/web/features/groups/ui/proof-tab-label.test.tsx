import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetDukjilCatalogCache } from "@/features/dukjil/ui/dukjil-provider";
import { ProofTabLabel } from "./proof-tab-label";

const catalog = vi.hoisted(() => ({ body: undefined as unknown, fail: false, calls: [] as string[] }));
vi.mock("./use-group-resource", () => ({
  useGroupRequest: () => ({
    ready: true, authenticated: false, ownerKey: "guest",
    request: async (url: string) => { catalog.calls.push(url); if (catalog.fail) throw new Error("UNAVAILABLE"); return catalog.body; },
  }),
  useGroupResource: () => ({ data: undefined, error: false, failure: undefined, loading: false, ownerKey: "guest", authenticated: false, ready: true, request: vi.fn(), retry: vi.fn() }),
}));
beforeEach(() => { resetDukjilCatalogCache(); Object.assign(catalog, { body: { version: 1, rules: { proof: { points: 100, firstPoints: 500 } }, missionBook: null }, fail: false, calls: [] }); });
afterEach(cleanup);

it("draws the policy points of the proof action as a corner badge beside the label, and reads only the catalog", async () => {
  const { container } = render(<ProofTabLabel label="덕후인증" locale="ko" />);
  expect(screen.getByText("덕후인증")).toBeInTheDocument();
  await waitFor(() => expect(container.querySelector('[data-earn-badge="corner"]')).toHaveTextContent("+100"));
  expect(container.querySelector('[data-earn-badge="corner"]')).toHaveTextContent("+100 마일리지");
  expect(catalog.calls).toEqual(["/api/dukjil/catalog?locale=ko"]);
});

it("takes the number from the policy, never from the code", async () => {
  catalog.body = { version: 2, rules: { proof: { points: 150 } }, missionBook: null };
  const { container } = render(<ProofTabLabel label="덕후인증" locale="ko" />);
  await waitFor(() => expect(container.querySelector('[data-earn-badge="corner"]')).toHaveTextContent("+150"));
});

it.each([
  ["a failed catalog read", () => { catalog.fail = true; }],
  ["a policy without the proof rule", () => { catalog.body = { version: 1, rules: { checkin: { points: 2 } }, missionBook: null }; }],
])("shows the label alone for %s", async (_name, arrange) => {
  arrange();
  const { container } = render(<ProofTabLabel label="덕후인증" locale="ko" />);
  await waitFor(() => expect(catalog.calls).toHaveLength(1));
  expect(screen.getByText("덕후인증")).toBeInTheDocument();
  expect(container.querySelector("[data-earn-badge]")).toBeNull();
});
