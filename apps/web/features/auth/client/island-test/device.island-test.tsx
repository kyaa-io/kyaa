// The 14-file island test device (plan-b §7.2, 6판 중간3): Profiler tick on every app commit, mirrors publish only when
// data changed (functions count as equal), forced publish right after RTL rerender. Rendered through the island RTL shim.
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useCreateWallet, useLogin, usePrivy } from "@/features/auth/client/privy-backend";

const sdk = vi.hoisted(() => ({
  user: null as { id: string } | null,
  login: undefined as unknown as () => void,
}));
vi.mock("@privy-io/react-auth", () => ({
  // New objects and new functions on every call, like many of the 14 files' fakes.
  usePrivy: () => ({ ready: true, authenticated: Boolean(sdk.user), user: sdk.user ? { ...sdk.user } : null, getAccessToken: vi.fn() }),
  useLogin: () => ({ login: sdk.login }),
  useCreateWallet: () => ({ createWallet: vi.fn() }),
}));

describe("island test device", () => {
  it("keeps an app update that lands in the same commit as a mirror re-read (mixed commit)", () => {
    function Screen() {
      const { user } = usePrivy();
      const [count, setCount] = useState(0);
      return <button onClick={() => { sdk.user = { id: "A" }; setCount(value => value + 1); }}>{`${user?.id ?? "guest"}:${count}`}</button>;
    }
    sdk.user = null;
    render(<Screen />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").textContent).toBe("A:1");
  });

  it("settles when several mirrors re-read fakes that return new objects every call (render cap)", () => {
    let renders = 0;
    function Screen() {
      renders += 1;
      usePrivy(); useLogin(); useCreateWallet();
      const [count, setCount] = useState(0);
      return <button onClick={() => setCount(value => value + 1)}>{count}</button>;
    }
    sdk.user = { id: "A" };
    render(<Screen />);
    renders = 0;
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").textContent).toBe("1");
    expect(renders).toBeLessThanOrEqual(3);
  });

  it("ends quietly when a lease is gone by the time its mirror publishes (no consumer)", () => {
    function Child() { useCreateWallet(); return null; }
    function Screen() {
      const [open, setOpen] = useState(true);
      usePrivy();
      return <>{open && <Child />}<button onClick={() => { sdk.user = { id: "B" }; setOpen(false); }}>close</button></>;
    }
    sdk.user = null;
    render(<Screen />);
    expect(() => act(() => { fireEvent.click(screen.getByRole("button")); })).not.toThrow();
  });

  it("hands over a function the test swapped when it calls rerender", () => {
    const first = vi.fn(), second = vi.fn();
    function Screen() { const { login } = useLogin(); return <button onClick={() => login()}>login</button>; }
    sdk.login = first;
    const view = render(<Screen />);
    sdk.login = second;
    view.rerender(<Screen />);
    fireEvent.click(screen.getByRole("button"));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("known limit: a function swapped without rerender stays the old one (data-only comparison)", () => {
    const first = vi.fn(), second = vi.fn();
    function Screen() {
      const { login } = useLogin();
      const [, setCount] = useState(0);
      return <><button onClick={() => login()}>login</button><button onClick={() => setCount(value => value + 1)}>tick</button></>;
    }
    sdk.login = first;
    render(<Screen />);
    sdk.login = second;
    fireEvent.click(screen.getByRole("button", { name: "tick" }));
    fireEvent.click(screen.getByRole("button", { name: "login" }));
    // Documented in plan-b §7.2 (e): such a test shows up as a diff and is reported as a failure, not passed silently.
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
