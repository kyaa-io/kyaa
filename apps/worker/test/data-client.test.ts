import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerClient } from "../src/data-client.js";
import { SupabaseQueueAdapter } from "../src/adapters/supabase-queue.js";

const url = "https://project.supabase.co";
const key = "s".repeat(48);
const source = { POSTGREST_URL: "http://postgrest.internal:3000", POSTGREST_SERVICE_TOKEN: "t".repeat(48) };
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
afterEach(() => vi.unstubAllGlobals());
describe("worker data source", () => {
  it.each([{ POSTGREST_URL: source.POSTGREST_URL }, { POSTGREST_SERVICE_TOKEN: source.POSTGREST_SERVICE_TOKEN }])("fails closed for a partial REST configuration", (partial) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(() => createWorkerClient(url, key, partial, options)).toThrow("must be configured together");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([false, true])("preserves RPC and query contracts (PostgREST=%s)", async (selfHosted) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("[]", { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const client = createWorkerClient(url, key, selfHosted ? source : {}, options);
    const queue = new SupabaseQueueAdapter(client);
    await expect(queue.claim("worker-1", 5, 120)).resolves.toEqual([]);
    const [input, init] = fetch.mock.calls[0] as unknown as [string | URL | Request, RequestInit];
    expect(String(input)).toBe(`${selfHosted ? source.POSTGREST_URL : `${url}/rest/v1`}/rpc/claim_blockchain_jobs`);
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${selfHosted ? source.POSTGREST_SERVICE_TOKEN : key}`);
    expect(JSON.parse(String(init.body))).toEqual({ p_worker_id: "worker-1", p_batch_size: 5, p_lease_seconds: 120 });
    await client.from("blockchain_jobs").select("id").eq("id", "job-1");
    expect(String(fetch.mock.calls[1]?.[0])).toContain("/blockchain_jobs?select=id&id=eq.job-1");
  });
  it("keeps Storage requests on Supabase with the original credential", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("proof")); vi.stubGlobal("fetch", fetch);
    const client = createWorkerClient(url, key, source, options);
    await client.storage!.from("certification-proofs").download("private/proof.png");
    const [input, init] = fetch.mock.calls[0] as unknown as [string | URL | Request, RequestInit];
    expect(String(input)).toContain(`${url}/storage/v1/object/certification-proofs/private/proof.png`);
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${key}`);
  });
});

it("uses AWS REST without constructing a Supabase client or inventing auth/storage", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json([{ id: "aws-row" }])); vi.stubGlobal("fetch",fetch);
  const client=createWorkerClient(undefined,undefined,source,options);
  expect("auth" in client).toBe(false);expect(client.storage).toBeUndefined();
  await expect(client.rpc("claim_blockchain_jobs",{p_worker_id:"aws-worker"})).resolves.toMatchObject({data:[{id:"aws-row"}],error:null});
  expect(String(fetch.mock.calls[0]?.[0])).toBe(`${source.POSTGREST_URL}/rpc/claim_blockchain_jobs`);
});
it("provides a real private S3 storage adapter with no legacy URL or key", () => {
  const client=createWorkerClient(undefined,undefined,{...source,AWS_STORAGE_ENABLED:true,AWS_REGION:"ap-northeast-2",S3_PRIVATE_BUCKET:"private-assets"},options);
  expect(client.storage).toBeDefined();expect("auth" in client).toBe(false);
  expect(()=>client.storage!.from("cms-assets")).toThrow("Unsupported private worker bucket");
});

it("normalizes an accepted trailing REST slash without changing the RPC path", async () => {
 const fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json([]));vi.stubGlobal("fetch",fetch);
 await createWorkerClient(undefined,undefined,{...source,POSTGREST_URL:source.POSTGREST_URL+"/"},options).rpc("claim_blockchain_jobs",{});
 expect(String(fetch.mock.calls[0]?.[0])).toBe(`${source.POSTGREST_URL}/rpc/claim_blockchain_jobs`);
});
