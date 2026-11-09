import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
  it("calls the SDK hook of the same name once, passing the same argument object and returning the same result object", async () => {
    const results = Object.fromEntries(HOOKS.map(name => [name, { from: name, action: vi.fn() }]));
    for (const name of HOOKS) sdk[name] = vi.fn(() => results[name]);
    const backend = await import("./privy-backend") as unknown as Record<string, (...args: unknown[]) => unknown>;
    expect(Object.keys(backend).sort()).toEqual([...HOOKS].sort());
    const argumentFor = (name: (typeof HOOKS)[number]): unknown[] => {
      if (name === "usePrivy" || name === "useUser") return [];
      // The JWT hook gets its real shape (cognito-auth.tsx); the others get a callbacks object.
      if (name === "useSubscribeToJwtAuthWithFlag") return [{ enabled: true, isAuthenticated: true, isLoading: false, getExternalJwt: async () => "jwt" }];
      return [{ onComplete: () => undefined, onError: () => undefined }];
    };
    for (const name of HOOKS) {
      const args = argumentFor(name);
      const result = backend[name](...args) as { action: unknown };
      expect(result, name).toBe(results[name]);
      expect(result.action, name).toBe(results[name].action);
      expect(sdk[name], name).toHaveBeenCalledTimes(1);
      const call = sdk[name].mock.calls[0];
      expect(call, name).toHaveLength(args.length);
      args.forEach((arg, index) => expect(call[index], `${name} argument ${index}`).toBe(arg));
    }
    // A mock swapped after import still decides the result (read at call time, not captured at import).
    const later = { from: "later" };
    sdk.usePrivy = vi.fn(() => later);
    expect(backend.usePrivy()).toBe(later);
    expect(sdk.usePrivy).toHaveBeenCalledTimes(1);
  });

  it("does not paper over a name the SDK (or a test fake) leaves out", async () => {
    sdk.usePrivy = vi.fn(() => ({ ready: true }));
    const backend = await import("./privy-backend") as unknown as Record<string, () => unknown>;
    expect(backend.usePrivy()).toEqual({ ready: true });
    expect(() => backend.useLogin()).toThrow();
  });

  // Static and side-effect imports, re-exports, `from` on its own line, dynamic import() and require(), subpaths included.
  const SDK_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']@privy-io\/react-auth(?:\/[^"']*)?["']/;

  it("recognises every way a file can reach the SDK", () => {
    for (const source of [
      'import { usePrivy } from "@privy-io/react-auth";',
      "import {\n  usePrivy,\n  useUser,\n}\n  from\n  '@privy-io/react-auth';",
      'export { useLogin } from "@privy-io/react-auth";',
      'import "@privy-io/react-auth";',
      'const sdk = await import(\n  "@privy-io/react-auth"\n);',
      'const sdk = require( "@privy-io/react-auth" );',
      'import { x } from "@privy-io/react-auth/ui";',
    ]) expect(SDK_IMPORT.test(source), source).toBe(true);
    for (const source of ['import { x } from "@privy-io/node";', 'import { x } from "@/features/auth/client/privy-backend";', '// "@privy-io/react-auth" is mentioned in a comment only']) {
      expect(SDK_IMPORT.test(source), source).toBe(false);
    }
  });

  it("is, with the provider tree, the only app code that imports the SDK", () => {
    const web = path.resolve(__dirname, "../../..");
    const allowed = new Set(["components/privy-provider.tsx", "features/auth/client/privy-backend.ts"]);
    const found: string[] = [];
    let scanned = 0;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (["node_modules", ".next", "e2e", "e2e-q", "q-contract", "test-results", "public"].includes(entry)) continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry) || /\.(test|spec|qc)\.[cm]?[jt]sx?$/.test(entry)) continue;
        const rel = path.relative(web, full);
        scanned += 1;
        // Read errors fail the test; they are not swallowed.
        if (SDK_IMPORT.test(readFileSync(full, "utf8"))) found.push(rel);
      }
    };
    for (const root of ["app", "components", "features", "lib", "server", "i18n", "seo"]) {
      const dir = path.join(web, root);
      if (!existsSync(dir)) continue; // Only a root that does not exist is skipped.
      walk(dir);
    }
    expect(scanned).toBeGreaterThan(500);
    // Exactly the provider tree and the backend: anything else is a direct SDK import to move behind the backend.
    expect(found.sort()).toEqual([...allowed].sort());
  });
});
