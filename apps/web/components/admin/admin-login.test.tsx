import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLogin } from "./admin-login";

const assign = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("./use-admin-session", () => ({ useAdminSession: () => ({ status: "unauthenticated" }) }));

describe("AdminLogin", () => {
  beforeEach(() => {
    assign.mockClear();
    window.history.replaceState({}, "", "/admin/login?returnTo=%2Fadmin%2Fusers");
    vi.stubGlobal("location", { ...window.location, assign, origin: window.location.origin, pathname: "/admin/login", search: "?returnTo=%2Fadmin%2Fusers" });
  });

  it("starts Google through Cognito and returns to the admin page, without claiming access", () => {
    render(<AdminLogin />);
    fireEvent.click(screen.getByRole("button", { name: "Google로 관리자 로그인" }));

    const destination = new URL(String(assign.mock.calls[0]?.[0]));
    expect(destination.pathname).toBe("/api/auth/cognito/start");
    expect(destination.searchParams.get("provider")).toBe("google");
    expect(destination.searchParams.get("returnTo")).toBe("/admin/login?returnTo=%2Fadmin%2Fusers");
    expect(screen.getByText("로그인 후 서버에서 관리자 권한을 확인합니다.")).toBeInTheDocument();
    expect(screen.queryByText("관리자 로그인 완료")).not.toBeInTheDocument();
  });

  it("renders an explicit denial without exposing admin navigation", () => {
    render(<AdminLogin access="denied" />);

    expect(screen.getByRole("alert")).toHaveTextContent("등록된 관리자 계정이 아닙니다");
    expect(screen.queryByRole("navigation", { name: "관리자 메뉴" })).not.toBeInTheDocument();
  });
});
