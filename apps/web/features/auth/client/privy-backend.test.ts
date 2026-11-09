import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const HOOKS = ["usePrivy", "useUser", "useCreateWallet", "useLogin", "useLoginWithOAuth", "useLinkWithOAuth", "useLinkEmail", "useLinkJwtAccount", "useOAuthTokens", "useSubscribeToJwtAuthWithFlag"] as const;

const sdk = vi.hoisted(() => ({} as Record<string, ReturnType<typeof vi.fn>>));
vi.mock("@privy-io/react-auth", () => sdk);

afterEach(() => {
  for (const key of Object.keys(sdk)) delete sdk[key];
  vi.resetModules();
});

describe("privy-backend (direct)", () => {
  it("calls the SDK hook of the same name at call time, with the same arguments and result", async () => {
    for (const name of HOOKS) sdk[name] = vi.fn(() => ({ from: name }));
    const backend = await import("./privy-backend") as unknown as Record<string, (...args: unknown[]) => unknown>;
    expect(Object.keys(backend).sort()).toEqual([...HOOKS].sort());
    for (const name of HOOKS) {
      const args = name === "usePrivy" || name === "useUser" ? [] : [{ onComplete: () => undefined }];
      expect(backend[name](...args), name).toEqual({ from: name });
      expect(sdk[name], name).toHaveBeenCalledWith(...args);
    }
    // A mock swapped after import still decides the result (read at call time, not captured at import).
    sdk.usePrivy = vi.fn(() => ({ from: "later" }));
    expect(backend.usePrivy()).toEqual({ from: "later" });
  });

  it("does not paper over a name the SDK (or a test fake) leaves out", async () => {
    sdk.usePrivy = vi.fn(() => ({ ready: true }));
    const backend = await import("./privy-backend") as unknown as Record<string, () => unknown>;
    expect(backend.usePrivy()).toEqual({ ready: true });
    expect(() => backend.useLogin()).toThrow();
  });

  it("is, with the provider tree, the only app code that imports the SDK", () => {
    const web = path.resolve(__dirname, "../../..");
    const allowed = new Set(["components/privy-provider.tsx", "features/auth/client/privy-backend.ts"]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (["node_modules", ".next", "e2e", "e2e-q", "q-contract", "test-results", "public"].includes(entry)) continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry) || /\.(test|spec|qc)\.tsx?$/.test(entry)) continue;
        const rel = path.relative(web, full);
        if (/from ["']@privy-io\/react-auth["']/.test(readFileSync(full, "utf8")) && !allowed.has(rel)) offenders.push(rel);
      }
    };
    for (const root of ["app", "components", "features", "lib", "server", "i18n", "seo"]) {
      try { walk(path.join(web, root)); } catch { /* optional root */ }
    }
    expect(offenders).toEqual([]);
  });
});
