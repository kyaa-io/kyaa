// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRankExpand } from "./use-rank-expand";

describe("useRankExpand", () => {
  it("starts closed, opens one key, and closes it on the same key again", () => {
    const { result } = renderHook(() => useRankExpand());
    expect(result.current.openKey).toBeNull();
    act(() => result.current.toggle("a"));
    expect(result.current.openKey).toBe("a");
    act(() => result.current.toggle("a"));
    expect(result.current.openKey).toBeNull();
  });

  it("keeps at most one key open: another key replaces the first", () => {
    const { result } = renderHook(() => useRankExpand());
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));
    expect(result.current.openKey).toBe("b");
    act(() => result.current.toggle("a"));
    expect(result.current.openKey).toBe("a");
  });

  it("keeps the same toggle across renders and the open key when the list is re-ordered", () => {
    const { result, rerender } = renderHook(({ order }: { order: string[] }) => ({ ...useRankExpand(), order }), { initialProps: { order: ["a", "b", "c"] } });
    const toggle = result.current.toggle;
    act(() => result.current.toggle("b"));
    rerender({ order: ["c", "b", "a"] });
    expect(result.current.openKey).toBe("b");
    expect(result.current.toggle).toBe(toggle);
  });
});
