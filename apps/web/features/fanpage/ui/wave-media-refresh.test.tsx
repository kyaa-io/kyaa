import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { subscribeFanActivityUpdates } from "@/components/fan-ui/fan-activity-updates";
import { WaveMediaComposer } from "./wave-media";
const state = vi.hoisted(() => ({ request: vi.fn(), ready: true, failed: false, retry: vi.fn() }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ user: { id: "privy-owner" } }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ownerId: "session-owner" }) }));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({ useContentMutation: () => ({ request: state.request, busy: false }) }));
vi.mock("@/features/content-safety/ui/use-wave-media-upload", () => ({ useWaveMediaUpload: () => ({ ready: state.ready, busy: false, retry: state.retry, items: [{ key: "photo", failed: state.failed, file: { name: "photo.jpg" }, media: { assetId: "00000000-0000-4000-8000-000000000001", state: state.ready ? "ready" : "processing" } }] }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); state.ready = true; state.failed = false; });
it.each([true, false])("refreshes the uploader's missions only after a valid album receipt (success=%s)", async success => {
  state.request.mockResolvedValue(success ? { id: "00000000-0000-4000-8000-000000000002", revision: 1, replayed: false } : null);
  const refresh = vi.fn(), other = vi.fn(), saved = vi.fn();
  const stop = subscribeFanActivityUpdates("session-owner", refresh), stopOther = subscribeFanActivityUpdates("other-owner", other);
  try {
    render(<WaveMediaComposer locale="ko" onSaved={saved} />);
    expect(screen.getByRole("button", { name: "게시" })).toBeEnabled();
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await waitFor(() => expect(state.request).toHaveBeenCalledOnce());
    if (success) await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(refresh).toHaveBeenCalledTimes(success ? 1 : 0);
    expect(other).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledTimes(success ? 1 : 0);
  } finally { stop(); stopOther(); }
});

it.each([false, true])("blocks publishing until every file is ready (failed=%s)", failed => {
  state.ready = false; state.failed = failed;
  render(<WaveMediaComposer locale="ko" onSaved={vi.fn()} />);
  const publish = screen.getByRole("button", { name: "게시" });
  expect(publish).toBeDisabled();
  fireEvent.click(publish);
  expect(state.request).not.toHaveBeenCalled();
  if (failed) {
    fireEvent.click(screen.getByRole("button", { name: "photo.jpg · 다시 시도" }));
    expect(state.retry).toHaveBeenCalledOnce();
  }
});
