import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/components/locale-provider", () => ({ useAppLocale: () => ({ locale: "ko" }) }));
vi.mock("next/dynamic", () => ({ default: () => (props: { person: { ref?: unknown } }) => <output data-testid="window">{JSON.stringify(props.person.ref)}</output> }));
import { ProfileWindowHost } from "./profile-window-host";
import { closeProfileWindow } from "./profile-window";
afterEach(() => { cleanup(); closeProfileWindow(); });

it("opens the same window after sign-in from ?profile= and removes only that from the address", async () => {
  const token = "30000000-0000-4000-8000-000000000003";
  history.replaceState(null, "", `/c/x/community/1?locale=ko&profile=${token}#c`);
  const view = render(<ProfileWindowHost/>);
  await waitFor(() => expect(view.getByTestId("window").textContent).toBe(JSON.stringify({ kind: "return", token })));
  expect(location.pathname + location.search + location.hash).toBe("/c/x/community/1?locale=ko#c");
});
it("ignores a value that is not a return ref, and still removes it", () => {
  history.replaceState(null, "", "/?profile=not-a-token");
  const view = render(<ProfileWindowHost/>);
  expect(view.queryByTestId("window")).toBeNull();
  expect(location.search).toBe("");
});
