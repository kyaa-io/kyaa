import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeChatDock, openChatDock, resetChatDockStore } from "@/features/group-social/chat-dock-store";
import { DeferredRootClients } from "./deferred-root-clients";

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: (loader: () => Promise<React.ComponentType>) => {
      const Lazy = React.lazy(() => loader().then(component => ({ default: component })));
      return function Dynamic() { return <React.Suspense fallback={null}><Lazy /></React.Suspense>; };
    },
  };
});
vi.mock("@/features/group-social/chat-dock-host", () => ({ ChatDockHost: () => <span data-testid="chat-dock-host" /> }));
vi.mock("./banksy-promotion/banksy-promotion", () => ({ BanksyEntryPromotion: () => <span data-testid="banksy" /> }));
vi.mock("@/features/tier-history/ui/tier-celebration", () => ({ TierCelebration: () => <span data-testid="tier" /> }));
vi.mock("./pwa-registration", () => ({ PwaRegistration: () => <span data-testid="pwa" /> }));

const target = { owner: "privy:fan", profileId: "p1", nickname: "Fan", avatarUrl: null, conversationId: null };

function renderBoth() {
  return render(<><DeferredRootClients slot="before" /><main /><DeferredRootClients slot="after" /></>);
}

describe("DeferredRootClients", () => {
  let readyState: DocumentReadyState;
  beforeEach(() => {
    resetChatDockStore();
    readyState = "loading";
    vi.spyOn(document, "readyState", "get").mockImplementation(() => readyState);
    vi.stubGlobal("requestIdleCallback", (callback: () => void) => window.setTimeout(callback, 0));
    vi.stubGlobal("cancelIdleCallback", (id: number) => window.clearTimeout(id));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetChatDockStore();
  });

  it("mounts nothing before the page has loaded, then all four after load and idle", async () => {
    renderBoth();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    for (const id of ["pwa", "chat-dock-host", "banksy", "tier"]) expect(screen.queryByTestId(id)).toBeNull();

    readyState = "complete";
    await act(async () => { window.dispatchEvent(new Event("load")); });
    for (const id of ["pwa", "chat-dock-host", "banksy", "tier"]) expect(await screen.findByTestId(id)).toBeInTheDocument();
  });

  it("mounts the chat dock at once when a chat is opened before load, and only the chat dock", async () => {
    renderBoth();
    await act(async () => { openChatDock(target); });
    expect(await screen.findByTestId("chat-dock-host")).toBeInTheDocument();
    for (const id of ["pwa", "banksy", "tier"]) expect(screen.queryByTestId(id)).toBeNull();
    // Closing it before load takes the host away again until the page has loaded.
    await act(async () => { closeChatDock(); });
    expect(screen.queryByTestId("chat-dock-host")).toBeNull();
  });

  it("mounts the chat dock at once for a chat restored from this tab's session", async () => {
    sessionStorage.setItem("kyaa.chat-dock", JSON.stringify(target));
    renderBoth();
    expect(await screen.findByTestId("chat-dock-host")).toBeInTheDocument();
    expect(screen.queryByTestId("banksy")).toBeNull();
  });
});
