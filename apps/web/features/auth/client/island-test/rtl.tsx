// Island Vitest project: stands in for @testing-library/react (regex alias, exact name only). Everything else is the real
// library (its dist entry keeps automatic cleanup); render and renderHook wrap the UI in the island test root:
// AuthBootProvider > [island, Profiler(app commits → tick) > the test's own wrapper > ui]  (plan-b §7.2).
import { Profiler, type ComponentType, type ReactNode } from "react";
import type * as RTL from "@testing-library/react";
// @ts-expect-error -- the package types its root entry only; this deep path is the same module without the alias loop.
import * as real from "@testing-library/react/dist/index.js";
import { AuthBootProvider } from "../privy-backend.island";
import { PrivyIsland } from "../privy-root.island";
import { IslandTestStore } from "./store";

const library = real as typeof RTL;
// @ts-expect-error -- same deep path as above.
export * from "@testing-library/react/dist/index.js";

export function IslandTestRoot({ store, children }: { store: IslandTestStore; children: ReactNode }) {
  return <AuthBootProvider store={store}>
    <PrivyIsland appId="island-test" config={{}} />
    <Profiler id="island-app" onRender={() => store.appCommitted()}>{children}</Profiler>
  </AuthBootProvider>;
}

function wrapperFor(store: IslandTestStore, Outer?: ComponentType<{ children: ReactNode }>) {
  return function IslandWrapper({ children }: { children: ReactNode }) {
    return <IslandTestRoot store={store}>{Outer ? <Outer>{children}</Outer> : children}</IslandTestRoot>;
  };
}

export const render: typeof RTL.render = ((ui: Parameters<typeof RTL.render>[0], options: Parameters<typeof RTL.render>[1] = {}) => {
  const store = new IslandTestStore();
  const result = library.render(ui, { ...options, wrapper: wrapperFor(store, options?.wrapper as ComponentType<{ children: ReactNode }> | undefined) });
  return { ...result, rerender: (next: Parameters<typeof result.rerender>[0]) => { store.forceNextPublish(); result.rerender(next); } };
}) as typeof RTL.render;

export const renderHook: typeof RTL.renderHook = ((callback: (props: unknown) => unknown, options: { wrapper?: ComponentType<{ children: ReactNode }> } & Record<string, unknown> = {}) => {
  const store = new IslandTestStore();
  const result = library.renderHook(callback, { ...options, wrapper: wrapperFor(store, options.wrapper) });
  return { ...result, rerender: (props?: unknown) => { store.forceNextPublish(); result.rerender(props); } };
}) as typeof RTL.renderHook;
