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

  const web = path.resolve(__dirname, "../../..");
  const sources = () => {
    const files: { rel: string; text: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (["node_modules", ".next", "e2e", "e2e-q", "q-contract", "test-results", "public", "island-test"].includes(entry)) continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry) || /\.(test|spec|qc|island-test)\.[cm]?[jt]sx?$/.test(entry) || /^vitest.*\.config\./.test(entry)) continue;
        // Read errors fail the test; they are not swallowed.
        files.push({ rel: path.relative(web, full), text: readFileSync(full, "utf8") });
      }
    };
    for (const root of ["app", "components", "features", "lib", "server", "i18n", "seo"]) {
      const dir = path.join(web, root);
      if (!existsSync(dir)) continue; // Only a root that does not exist is skipped.
      walk(dir);
    }
    // Files directly under apps/web (proxy.ts, next.config.ts, …).
    for (const entry of readdirSync(web)) if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry) && !/\.test\.|^vitest|^playwright/.test(entry)) files.push({ rel: entry, text: readFileSync(path.join(web, entry), "utf8") });
    return files;
  };

  it("keeps SDK imports to the direct tree, the direct backend, the island mirrors and the island Provider boundary", () => {
    const files = sources();
    expect(files.length).toBeGreaterThan(500);
    // Type-only imports and re-exports are erased at build time; only run-time reaches count.
    const runtime = (text: string) => text.replace(/(?:import|export)\s+type\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g, "").replace(/import\s+type\s+[\w*\s]+\s+from\s*["'][^"']+["'];?/g, "");
    expect(files.filter(file => SDK_IMPORT.test(runtime(file.text))).map(file => file.rel).sort()).toEqual([
      "components/privy-provider.tsx",
      "features/auth/client/privy-backend.ts",
      "features/auth/client/privy-mirrors.tsx",
      "features/auth/client/privy-provider-boundary.tsx",
    ]);
    // Value imports of PrivyProvider: the direct tree and the boundary only (plan-b §7.3-6).
    const PROVIDER_IMPORT = /import\s*\{[^}]*\bPrivyProvider\b[^}]*\}\s*from\s*["']@privy-io\/react-auth["']/;
    expect(files.filter(file => PROVIDER_IMPORT.test(runtime(file.text))).map(file => file.rel).sort())
      .toEqual(["components/privy-provider.tsx", "features/auth/client/privy-provider-boundary.tsx"]);
  });

  it("reaches the backends only by the path names the island build swaps (plan-b §7.3-4)", () => {
    const backendFiles = new Set([
      "features/auth/client/privy-backend.ts", "features/auth/client/privy-backend.island.tsx", "features/auth/client/privy-mirrors.tsx",
      "features/auth/client/privy-root.tsx", "features/auth/client/privy-root.island.tsx",
    ]);
    const specifiers = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']*privy-(?:backend|root|mirrors|provider-boundary)[^"']*)["']/g;
    const allowed = new Set(["@/features/auth/client/privy-backend", "@/features/auth/client/privy-root", "@/features/auth/client/privy-provider-boundary"]);
    const offenders: string[] = [];
    for (const file of sources()) {
      if (backendFiles.has(file.rel)) continue;
      for (const match of file.text.matchAll(specifiers)) if (!allowed.has(match[1])) offenders.push(`${file.rel} → ${match[1]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the shared Provider settings free of the SDK, the backends and the direct tree at run time", () => {
    const text = readFileSync(path.join(__dirname, "privy-provider-config.ts"), "utf8");
    const valueImports = [...text.matchAll(/^import\s+(?!type\b)[^;]*?from\s*["']([^"']+)["']/gm)].map(match => match[1]);
    expect(valueImports.filter(name => /@privy-io|privy-backend|privy-root|privy-mirrors|components\/privy-provider/.test(name))).toEqual([]);
  });
});
