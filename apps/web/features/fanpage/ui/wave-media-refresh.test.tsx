import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { subscribeFanActivityUpdates } from "@/components/fan-ui/fan-activity-updates";
import { WaveMediaComposer } from "./wave-media";
const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ user: { id: "privy-owner" } }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ownerId: "session-owner" }) }));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({ useContentMutation: () => ({ request: state.request, busy: false }) }));
vi.mock("@/features/content-safety/ui/use-wave-media-upload", () => ({ useWaveMediaUpload: () => ({ ready: true, items: [{ key: "photo", file: { name: "photo.jpg" }, media: { assetId: "00000000-0000-4000-8000-000000000001", state: "ready" } }] }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it.each([true, false])("refreshes the uploader's missions only after a valid album receipt (success=%s)", async success => {
  state.request.mockResolvedValue(success ? { id: "00000000-0000-4000-8000-000000000002", revision: 1, replayed: false } : null);
  const refresh = vi.fn(), other = vi.fn(), saved = vi.fn();
  const stop = subscribeFanActivityUpdates("session-owner", refresh), stopOther = subscribeFanActivityUpdates("other-owner", other);
  try {
    render(<WaveMediaComposer locale="ko" onSaved={saved} />);
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await waitFor(() => expect(state.request).toHaveBeenCalledOnce());
    if (success) await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(refresh).toHaveBeenCalledTimes(success ? 1 : 0);
    expect(other).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledTimes(success ? 1 : 0);
  } finally { stop(); stopOther(); }
});
