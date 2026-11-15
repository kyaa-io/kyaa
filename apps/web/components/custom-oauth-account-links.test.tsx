import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomOAuthAccountLinks } from "./custom-oauth-account-links";

const initOAuth = vi.fn(), refreshUser = vi.fn(), logout = vi.fn(), resetTransition = vi.fn();
const wallet = { type: "wallet", chainType: "ethereum", walletClientType: "privy", address: "0x1111111111111111111111111111111111111111" };
let user = { id: "did:privy:original", linkedAccounts: [wallet] };
let status = "initial";
vi.mock("@privy-io/react-auth", () => ({ useLinkWithOAuth: () => ({ initOAuth, loading: false, state: { status } }), useUser: () => ({ refreshUser }) }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: true, user, logout }) }));
vi.mock("./byus-session-provider", () => ({ useByUsSession: () => ({ resetTransition }) }));

beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear(); status = "initial";
  user = { id: "did:privy:original", linkedAccounts: [wallet] };
  initOAuth.mockResolvedValue(undefined); refreshUser.mockResolvedValue({ ...user, linkedAccounts: [wallet, { type: "custom:kakao" }] });
});
describe("existing member OAuth linking", () => {
  it("starts linking on the original DID and completes with an unchanged wallet", async () => {
    const view = render(<CustomOAuthAccountLinks locale="ko" visible kakaoLoginEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "카카오 연결" }));
    await waitFor(() => expect(initOAuth).toHaveBeenCalledWith({ provider: "custom:kakao" }));
    expect(JSON.parse(sessionStorage.getItem("kyaa.custom-oauth-link")!)).toMatchObject({ userId: user.id, wallets: wallet.address });
    status = "done"; view.rerender(<CustomOAuthAccountLinks locale="ko" visible kakaoLoginEnabled />);
    await screen.findByRole("status"); expect(logout).not.toHaveBeenCalled(); expect(sessionStorage.getItem("kyaa.custom-oauth-link")).toBeNull();
  });
  it("invalidates the session if callback changes the DID or wallet", async () => {
    sessionStorage.setItem("kyaa.custom-oauth-link", JSON.stringify({ userId: user.id, wallets: wallet.address, provider: "custom:kakao", startedAt: Date.now() }));
    refreshUser.mockResolvedValue({ ...user, id: "did:privy:other" }); status = "done";
    render(<CustomOAuthAccountLinks locale="ko" visible kakaoLoginEnabled />);
    await screen.findByRole("alert"); expect(logout).toHaveBeenCalledOnce(); expect(resetTransition).toHaveBeenCalledOnce();
  });
  it("retains the original account on provider-link conflict", async () => {
    initOAuth.mockRejectedValue(new Error("already linked")); render(<CustomOAuthAccountLinks locale="ko" visible kakaoLoginEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "카카오 연결" })); await screen.findByRole("alert");
    expect(logout).not.toHaveBeenCalled(); expect(user.id).toBe("did:privy:original"); expect(sessionStorage.getItem("kyaa.custom-oauth-link")).toBeNull();
  });
});

it("ignores a delayed callback after switching accounts", async () => {
  let resolve!: (value: unknown) => void;
  refreshUser.mockImplementation(() => new Promise((done) => { resolve = done; }));
  sessionStorage.setItem("kyaa.custom-oauth-link", JSON.stringify({ userId: user.id, wallets: wallet.address, provider: "custom:kakao", startedAt: Date.now() }));
  status = "done"; const view = render(<CustomOAuthAccountLinks locale="ko" visible kakaoLoginEnabled />);
  await waitFor(() => expect(refreshUser).toHaveBeenCalledOnce());
  user = { ...user, id: "did:privy:other" }; view.rerender(<CustomOAuthAccountLinks locale="ko" visible kakaoLoginEnabled />);
  await act(async () => { resolve({ id: "unrelated", linkedAccounts: [] }); });
  await waitFor(() => expect(sessionStorage.getItem("kyaa.custom-oauth-link")).toBeNull());
  expect(logout).not.toHaveBeenCalled(); expect(resetTransition).not.toHaveBeenCalled(); expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("ignores a delayed callback after unmount", async () => {
  let resolve!: (value: unknown) => void;
  refreshUser.mockImplementation(() => new Promise((done) => { resolve = done; }));
  sessionStorage.setItem("kyaa.custom-oauth-link", JSON.stringify({ userId: user.id, wallets: wallet.address, provider: "custom:kakao", startedAt: Date.now() }));
  status = "done"; const view = render(<CustomOAuthAccountLinks locale="ko" visible kakaoLoginEnabled />);
  await waitFor(() => expect(refreshUser).toHaveBeenCalledOnce()); view.unmount();
  await act(async () => { resolve({ id: "unrelated", linkedAccounts: [] }); });
  expect(logout).not.toHaveBeenCalled(); expect(resetTransition).not.toHaveBeenCalled();
});

it.each([
  ["LINE 연결", "line", "line_oauth"],
  ["Facebook 연결", "custom:facebook", "custom:facebook"],
  ["네이버 연결", "custom:naver", "custom:naver"],
])("links %s using its SDK identifier and confirms its linked-account type", async (name, provider, accountType) => {
  refreshUser.mockResolvedValue({ ...user, linkedAccounts: [wallet, { type: accountType }] });
  const view = render(<CustomOAuthAccountLinks locale="ko" visible lineLoginEnabled facebookLoginEnabled naverLoginEnabled />);
  fireEvent.click(screen.getByRole("button", { name }));
  await waitFor(() => expect(initOAuth).toHaveBeenCalledWith({ provider }));
  expect(JSON.parse(sessionStorage.getItem("kyaa.custom-oauth-link")!).provider).toBe(provider);
  status = "done"; view.rerender(<CustomOAuthAccountLinks locale="ko" visible lineLoginEnabled facebookLoginEnabled naverLoginEnabled />);
  await screen.findByRole("status"); expect(logout).not.toHaveBeenCalled();
});

it("does not claim LINE linking completed for a custom:line account", async () => {
  refreshUser.mockResolvedValue({ ...user, linkedAccounts: [wallet, { type: "custom:line" }] });
  sessionStorage.setItem("kyaa.custom-oauth-link", JSON.stringify({ userId: user.id, wallets: wallet.address, provider: "line", startedAt: Date.now() }));
  status = "done"; render(<CustomOAuthAccountLinks locale="ko" visible lineLoginEnabled />);
  await screen.findByRole("alert"); expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
