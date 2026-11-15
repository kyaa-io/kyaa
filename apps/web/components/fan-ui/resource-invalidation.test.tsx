// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFanpageResource } from "@/features/fanpage/ui/use-fanpage-resource";
import { usePreloadGroupResource } from "@/features/groups/ui/use-group-preload";
import { useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { useRankingResource } from "@/features/rankings/ui/use-ranking-resource";
import { clearResources, invalidateAfterWrite, installResourceWriteWatch, ME_RESOURCE_FRESH_MS, peekResource, storeResource, syncResourceOwner } from "./resource-cache";

const identity = vi.hoisted(() => ({ owner: "owner-a", generation: 1 }));
vi.mock("@/features/auth/client/cognito-auth", () => {
  const getAccessToken = async () => "token";
  return { useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: identity.owner }, getAccessToken }) };
});
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: identity.owner, generation: identity.generation, error: null }) }));
vi.mock("@/components/locale-provider", () => ({ useAppLocale: () => ({ locale: "ko" }) }));

const parse = (value: unknown) => value as { n: number };
const flushNotify = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)); });
const ownerKey = () => `${identity.owner}:${identity.generation}`;

function jsonFetch(reads: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (method !== "GET") return Response.json({ ok: true });
    return Response.json(reads[url] ?? { n: -1 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, reads: () => calls.filter((call) => call.startsWith("GET ")) };
}

const handle = { write: async (): Promise<unknown> => null, retry: () => {} };
const write = () => handle.write();
const seen: string[] = [];
function GroupView({ url }: { url: string }) {
  const { data, loading, request } = useGroupResource(url, parse);
  useEffect(() => { handle.write = () => request("/api/groups/x/posts", { method: "POST", body: "{}" }); });
  seen.push(loading ? "group:loading" : "group:value");
  return <p data-testid="group">{loading ? "LOADING" : data ? `n=${data.n}` : "EMPTY"}</p>;
}
function FanpageView({ url }: { url: string }) {
  const { state } = useFanpageResource(url, parse);
  seen.push(`fanpage:${state.status}`);
  return <p data-testid="fanpage">{state.status === "ready" ? `n=${state.data.n}` : state.status}</p>;
}
function RankingView({ url }: { url: string }) {
  const { state } = useRankingResource(url, parse);
  seen.push(`ranking:${state.status}`);
  return <p data-testid="ranking">{state.status === "ready" ? `n=${state.data.n}` : state.status}</p>;
}
function Writer() { const { request } = useGroupRequest(); useEffect(() => { handle.write = () => request("/api/groups/x/posts", { method: "POST", body: "{}" }); }); return null; }

beforeEach(() => { identity.owner = "owner-a"; identity.generation = 1; syncResourceOwner(ownerKey()); clearResources(); seen.length = 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("a write empties the store under mounted hooks", () => {
  it("keeps a value read from the store on screen and re-reads it behind", async () => {
    const net = jsonFetch({ "/api/y": { n: 2 } });
    storeResource(`${ownerKey()}:ko:true:/api/y`, { n: 1 });
    render(<GroupView url="/api/y" />);
    expect(screen.getByTestId("group")).toHaveTextContent("n=1");
    expect(net.reads()).toHaveLength(0);
    await act(async () => { await write(); });
    await flushNotify();
    await waitFor(() => expect(screen.getByTestId("group")).toHaveTextContent("n=2"));
    expect(seen).not.toContain("group:loading");
    expect(net.reads()).toEqual(["GET /api/y"]);
  });
  it("re-reads a tab opened from a preload without showing loading", async () => {
    const net = jsonFetch({ "/api/groups/tab": { n: 1 } });
    function Preloader() { const preload = usePreloadGroupResource(); useEffect(() => { handle.write = async () => preload("/api/groups/tab"); }); return null; }
    const first = render(<Preloader />);
    await act(async () => { await write(); });
    await waitFor(() => expect(peekResource(`${ownerKey()}:ko:true:/api/groups/tab`)).toBeDefined());
    first.unmount();
    net.calls.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { net.calls.push(`${init?.method ?? "GET"} ${String(input)}`); return Response.json(init?.method ? { ok: true } : { n: 2 }); }));
    render(<><GroupView url="/api/groups/tab" /></>);
    expect(screen.getByTestId("group")).toHaveTextContent("n=1");
    await act(async () => { await write(); });
    await flushNotify();
    await waitFor(() => expect(screen.getByTestId("group")).toHaveTextContent("n=2"));
    expect(seen).not.toContain("group:loading");
  });
  it("reuses an /api/me value read moments ago, so panels mounting one after another on first load read it once", async () => {
    const net = jsonFetch({ "/api/me/wallet": { n: 2 } });
    storeResource(`${ownerKey()}:ko:true:/api/me/wallet`, { n: 1 });
    render(<><GroupView url="/api/me/wallet" /><GroupView url="/api/me/wallet" /></>);
    await flushNotify();
    expect(screen.getAllByTestId("group").map((node) => node.textContent)).toEqual(["n=1", "n=1"]);
    expect(net.reads()).toHaveLength(0);
  });
  it("keeps showing /api/me values and re-reads them once the short window has passed and after a write", async () => {
    const net = jsonFetch({ "/api/me/summary": { n: 2 } });
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now - ME_RESOURCE_FRESH_MS - 1);
    storeResource(`${ownerKey()}:ko:true:/api/me/summary`, { n: 1 });
    clock.mockRestore();
    render(<GroupView url="/api/me/summary" />);
    expect(screen.getByTestId("group")).toHaveTextContent("n=1");
    await waitFor(() => expect(screen.getByTestId("group")).toHaveTextContent("n=2"));
    net.calls.length = 0;
    await act(async () => { await write(); });
    await flushNotify();
    await waitFor(() => expect(net.reads()).toEqual(["GET /api/me/summary"]));
    expect(seen).not.toContain("group:loading");
  });
  it("keeps the last value when the re-read after a write fails", async () => {
    let failing = false;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method) return Response.json({ ok: true });
      return failing ? Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 }) : Response.json({ n: 2 });
    }));
    storeResource(`${ownerKey()}:ko:true:/api/y`, { n: 1 });
    render(<GroupView url="/api/y" />);
    failing = true;
    await act(async () => { await write(); });
    await flushNotify();
    await flushNotify();
    expect(screen.getByTestId("group")).toHaveTextContent("n=1");
  });
  it("re-reads the fanpage and ranking hooks without a loading flash", async () => {
    const net = jsonFetch({ "/api/public/a": { n: 2 }, "/api/rankings/a": { n: 2 } });
    storeResource(`owner-a:1:/api/public/a`, { n: 1 });
    storeResource(`ranking:owner-a:/api/rankings/a`, { n: 1 });
    render(<><Writer /><FanpageView url="/api/public/a" /><RankingView url="/api/rankings/a" /></>);
    expect(screen.getByTestId("fanpage")).toHaveTextContent("n=1");
    expect(screen.getByTestId("ranking")).toHaveTextContent("n=1");
    await act(async () => { await write(); });
    await flushNotify();
    await waitFor(() => { expect(screen.getByTestId("fanpage")).toHaveTextContent("n=2"); expect(screen.getByTestId("ranking")).toHaveTextContent("n=2"); });
    expect(seen).not.toContain("fanpage:loading");
    expect(seen).not.toContain("ranking:loading");
    expect(net.reads().sort()).toEqual(["GET /api/public/a", "GET /api/rankings/a"]);
  });
  it("reads once when the caller also retries right after the write", async () => {
    const net = jsonFetch({ "/api/y": { n: 2 } });
    storeResource(`${ownerKey()}:ko:true:/api/y`, { n: 1 });
    function View() { const r = useGroupResource("/api/y", parse); useEffect(() => { handle.retry = r.retry; handle.write = () => r.request("/api/groups/x/posts", { method: "POST", body: "{}" }); }); return <p data-testid="group">{r.data?.n ?? "none"}</p>; }
    render(<View />);
    await act(async () => { await write(); handle.retry(); });
    await flushNotify();
    await waitFor(() => expect(screen.getByTestId("group")).toHaveTextContent("2"));
    expect(net.reads()).toEqual(["GET /api/y"]);
  });
  it("reads once when the write's response body arrives after its headers", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      if (!init?.method) return Response.json({ n: 2 });
      return { ok: true, status: 200, json: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 15)) } as Response;
    }));
    storeResource(`${ownerKey()}:ko:true:/api/y`, { n: 1 });
    function View() { const r = useGroupResource("/api/y", parse); useEffect(() => { handle.retry = r.retry; handle.write = () => r.request("/api/groups/x/posts", { method: "POST", body: "{}" }); }); return <p data-testid="group">{r.data?.n ?? "none"}</p>; }
    render(<View />);
    await act(async () => { await write(); handle.retry(); });
    await flushNotify();
    await waitFor(() => expect(screen.getByTestId("group")).toHaveTextContent("2"));
    expect(calls.filter((call) => call.startsWith("GET "))).toEqual(["GET /api/y"]);
  });
  it("drops the old value for a read that started before the write", async () => {
    let release: (value: Response) => void = () => {};
    const slow = new Promise<Response>((resolve) => { release = resolve; });
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method) return Response.json({ ok: true });
      reads += 1;
      return reads === 1 ? slow : Response.json({ n: 2 });
    }));
    render(<><Writer /><FanpageView url="/api/public/race" /><RankingView url="/api/public/race2" /></>);
    await waitFor(() => expect(reads).toBeGreaterThan(0));
    await act(async () => { await write(); });
    await flushNotify();
    await act(async () => { release(Response.json({ n: 1 })); await Promise.resolve(); });
    await waitFor(() => expect(screen.getByTestId("fanpage")).toHaveTextContent("n=2"));
    expect(peekResource("owner-a:1:/api/public/race")?.value).toEqual({ n: 2 });
  });
});

describe("an owner change", () => {
  it("never keeps the previous owner's value", async () => {
    jsonFetch({});
    let finish: (value: Response) => void = () => {};
    storeResource(`${ownerKey()}:ko:true:/api/y`, { n: 1 });
    storeResource(`owner-a:1:/api/public/a`, { n: 1 });
    storeResource(`ranking:owner-a:/api/rankings/a`, { n: 1 });
    const tree = () => <><GroupView url="/api/y" /><FanpageView url="/api/public/a" /><RankingView url="/api/rankings/a" /></>;
    const view = render(tree());
    expect(screen.getByTestId("group")).toHaveTextContent("n=1");
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    identity.owner = "owner-b"; identity.generation = 2;
    view.rerender(tree());
    expect(screen.getByTestId("group")).toHaveTextContent("LOADING");
    expect(screen.getByTestId("fanpage")).toHaveTextContent("loading");
    expect(screen.getByTestId("ranking")).toHaveTextContent("loading");
    await flushNotify();
    expect(screen.getByTestId("group")).toHaveTextContent("LOADING");
    finish(Response.json({ n: 9 }));
  });
});

describe("writes outside useGroupRequest", () => {
  const stored = () => peekResource("k");
  async function send(input: RequestInfo | URL, init?: RequestInit, status = 200) {
    const original = vi.fn(async () => new Response(status === 204 ? null : "{}", { status }));
    vi.stubGlobal("fetch", original);
    const uninstall = installResourceWriteWatch();
    storeResource("k", 1);
    await window.fetch(input, init);
    uninstall();
    return original;
  }
  it("clears after a successful same-origin write", async () => {
    const original = await send("/api/content-blocks", { method: "POST", body: "{}" });
    expect(original).toHaveBeenCalledOnce();
    expect(stored()).toBeUndefined();
    await send(new Request(`${location.origin}/api/content-blocks/1`, { method: "DELETE" }));
    expect(stored()).toBeUndefined();
    await send("/api/celebrities/x/reactions", { method: "post" }, 204);
    expect(stored()).toBeUndefined();
  });
  it.each([
    ["reads", "/api/content-blocks", undefined, 200],
    ["failed writes", "/api/content-blocks", { method: "POST" }, 500],
    ["another origin", "https://s3.example.test/api/upload", { method: "PUT" }, 200],
    ["analytics", "/api/analytics/performance", { method: "POST" }, 200],
    ["events", "/api/events", { method: "POST" }, 200],
    ["visits", "/api/campaigns/banksy/visit", { method: "POST" }, 200],
    ["session", "/api/auth/session", { method: "POST" }, 200],
    ["translations", "/api/display-translations", { method: "POST" }, 200],
    ["content translations", "/api/content-translations", { method: "POST" }, 200],
    ["presence", "/api/groups/1/presence", { method: "PUT" }, 200],
  ] as const)("leaves the store alone for %s", async (_name, url, init, status) => {
    await send(url, init as RequestInit | undefined, status);
    expect(stored()?.value).toBe(1);
  });
  it("restores fetch and passes the response through", async () => {
    const stub = vi.fn(async () => Response.json({ a: 1 }));
    vi.stubGlobal("fetch", stub);
    const uninstall = installResourceWriteWatch();
    const again = installResourceWriteWatch();
    expect(await (await window.fetch("/api/x", { method: "POST" })).json()).toEqual({ a: 1 });
    expect(stub).toHaveBeenCalledOnce();
    again();
    uninstall();
    expect(window.fetch).toBe(stub);
  });
  it("wakes mounted hooks after a block, so the blocked author leaves the list", async () => {
    let blocked = false;
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method) { blocked = true; return Response.json({ ok: true }); }
      if (blocked) await readGate;
      return Response.json({ n: blocked ? 2 : 1 });
    }));
    const uninstall = installResourceWriteWatch();
    render(<GroupView url="/api/groups/1/posts" />);
    await waitFor(() => expect(screen.getByTestId("group")).toHaveTextContent("n=1"));
    await act(async () => { await window.fetch("/api/content-blocks", { method: "POST", body: "{}" }); });
    expect(peekResource(`${ownerKey()}:ko:true:/api/groups/1/posts`)).toBeUndefined();
    releaseRead();
    await flushNotify();
    await waitFor(() => expect(screen.getByTestId("group")).toHaveTextContent("n=2"));
    uninstall();
  });
});

describe("261107-2 F4: a reaction, comment or comment like re-reads only the post and the fan's own values", () => {
  const shared = ["k:/api/me/wallet", "k:ko:true:/api/me/dukjil/today", "k:/api/celebrities/elina/feed?x=1", "k:ko:true:/api/groups/g1/posts?category=all"];
  const comments = ["k:/api/posts/p1/comments?locale=ko", "k:ko:true:/api/groups/g1/posts/p1/comments"];
  const posts = ["k:/api/posts/p1?locale=ko", "k:ko:true:/api/groups/g1/posts/p1?format=rich"];
  it.each([
    ["fan post like", "/api/posts/p1/like", [...posts], comments],
    ["group post reaction", "/api/groups/g1/posts/p1/reaction", [...posts], comments],
    ["group post dislike", "/api/groups/g1/posts/p1/dislike", [...posts], comments],
    ["fan post comment", "/api/posts/p1/comments", [...posts, ...comments], []],
    ["group comment", "/api/groups/g1/posts/p1/comments", [...posts, ...comments], []],
    ["group comment delete", "/api/groups/g1/posts/p1/comments/c1", [...posts, ...comments], []],
    ["comment like", "/api/post-comments/c1/reaction", comments, posts],
    ["comment delete", "/api/post-comments/c1", comments, posts],
  ])("%s", (_name, path, dropped, alsoKept) => {
    const kept = ["k:/api/groups/g1", "k:/api/celebrities/elina", "ranking:k:/api/rankings/x", "k:/api/notifications", "k:/api/posts/p2?locale=ko", ...alsoKept];
    for (const key of [...kept, ...dropped, ...shared]) storeResource(key, 1);
    invalidateAfterWrite(path);
    for (const key of kept) expect(peekResource(key)?.value, key).toBe(1);
    for (const key of [...dropped, ...shared]) expect(peekResource(key), key).toBeUndefined();
  });
  it("still empties everything for other writes (blocks, hearts, entries)", () => {
    for (const path of ["/api/content-blocks", "/api/celebrities/x/reactions", "/api/groups/g1/raffles/r1/entries", "/api/posts"]) {
      storeResource("k:/api/groups/g1", 1);
      invalidateAfterWrite(path);
      expect(peekResource("k:/api/groups/g1"), path).toBeUndefined();
    }
  });
  it("does not wake an unrelated mounted hook, and re-reads the post behind its value without a loading state", async () => {
    const io = jsonFetch({ "/api/groups/1": { n: 1 }, "/api/groups/1/posts/p1?format=rich": { n: 10 } });
    const uninstall = installResourceWriteWatch();
    render(<><GroupView url="/api/groups/1" /><FanpageView url="/api/groups/1/posts/p1?format=rich" /></>);
    await waitFor(() => expect(screen.getByTestId("fanpage")).toHaveTextContent("n=10"));
    await waitFor(() => expect(screen.getByTestId("group")).toHaveTextContent("n=1"));
    const before = io.reads().length; seen.length = 0;
    await act(async () => { await window.fetch("/api/groups/1/posts/p1/reaction", { method: "PUT", body: "{}" }); });
    await flushNotify();
    await waitFor(() => expect(io.reads().length).toBe(before + 1));
    expect(io.reads().at(-1)).toBe("GET /api/groups/1/posts/p1?format=rich");
    expect(seen.filter((entry) => /loading/.test(entry))).toEqual([]);
    uninstall();
  });
});
