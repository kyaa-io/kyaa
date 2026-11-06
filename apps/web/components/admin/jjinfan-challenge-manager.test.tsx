import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ role: "admin" as string, status: "authorized" as string, getAccessToken: async () => "token" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ getAccessToken: h.getAccessToken }) }));
vi.mock("./use-admin-session", () => ({ useAdminSession: () => ({ status: h.status, admin: { email: "a@example.test", role: h.role } }) }));
vi.mock("./operations-shell", () => ({ AdminOperationsShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("./admin-access-state", () => ({ AdminAccessState: ({ status }: { status: string }) => <p>access {status}</p> }));
import { JjinfanChallengeManager } from "./jjinfan-challenge-manager";

const row = { celebrityId: "10000000-0000-4000-8000-00000000000a", slug: "elina", name: "엘리나", enabled: false, title: "", description: "", updatedAt: null, count: 3 };
const fetchMock = vi.fn();
beforeEach(() => {
  h.role = "admin"; h.status = "authorized"; fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "PUT" ? new Response(JSON.stringify({ item: {} }), { status: 200 }) : new Response(JSON.stringify({ items: [row] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("starts off and refuses to turn on without a title", async () => {
  render(<JjinfanChallengeManager />);
  const toggle = await screen.findByRole("checkbox", { name: "페이지에 표시" });
  expect(toggle).not.toBeChecked();
  expect(screen.getByText("꺼짐")).toBeInTheDocument();
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("제목을 입력");
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toEqual([]);
});
it("saves the administrator's words for that creator", async () => {
  render(<JjinfanChallengeManager />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "페이지에 표시" }));
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "운영자 제목" } });
  fireEvent.change(screen.getByLabelText("설명"), { target: { value: "운영자 설명" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장했습니다"));
  const [url, init] = fetchMock.mock.calls.find(([, options]) => options?.method === "PUT")!;
  expect(url).toBe(`/api/admin/jjinfan-challenge/${row.celebrityId}`);
  expect(JSON.parse(init.body)).toEqual({ enabled: true, title: "운영자 제목", description: "운영자 설명" });
  expect(screen.getByText("표시 중")).toBeInTheDocument();
});
it("reports a failed save and keeps the input", async () => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "PUT" ? new Response("{}", { status: 503 }) : new Response(JSON.stringify({ items: [row] }), { status: 200 }));
  render(<JjinfanChallengeManager />);
  fireEvent.change(await screen.findByLabelText("제목"), { target: { value: "초안" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했습니다");
  expect(screen.getByLabelText("제목")).toHaveValue("초안");
});
it("lets a viewer read only", async () => {
  h.role = "viewer";
  render(<JjinfanChallengeManager />);
  expect(await screen.findByRole("checkbox", { name: "페이지에 표시" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
});
it("shows the access state for a non-admin", () => {
  h.status = "denied";
  render(<JjinfanChallengeManager />);
  expect(screen.getByText("access denied")).toBeInTheDocument();
});
