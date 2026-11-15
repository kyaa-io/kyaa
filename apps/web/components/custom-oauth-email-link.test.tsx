import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomOAuthEmailLink } from "./custom-oauth-email-link";

const sendCode = vi.fn();
const linkWithCode = vi.fn();
const refreshUser = vi.fn();
let user = { id: "did:privy:original" };
vi.mock("@privy-io/react-auth", () => ({ useLinkEmail: () => ({ sendCode, linkWithCode }), useUser: () => ({ refreshUser }) }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ user }) }));

beforeEach(() => {
  vi.resetAllMocks(); user = { id: "did:privy:original" };
  sendCode.mockResolvedValue(undefined);
  linkWithCode.mockResolvedValue({ user }); refreshUser.mockResolvedValue(user);
});
async function send() {
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "fan@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "인증 코드 받기" }));
  await screen.findByLabelText("인증 코드");
}
describe("custom OAuth email linking", () => {
  it("links email OTP on the same DID and only then resumes the session", async () => {
    const complete = vi.fn(); render(<CustomOAuthEmailLink locale="ko" userId={user.id} onComplete={complete} />);
    await send(); expect(sendCode).toHaveBeenCalledWith({ email: "fan@example.com" });
    fireEvent.change(screen.getByLabelText("인증 코드"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "확인하고 계속하기" }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(linkWithCode).toHaveBeenCalledWith({ code: "123456" });
  });
  it("does not continue if SDK returns a different DID", async () => {
    const complete = vi.fn(); linkWithCode.mockResolvedValue({ user: { id: "other" } });
    render(<CustomOAuthEmailLink locale="ko" userId={user.id} onComplete={complete} />);
    await send(); fireEvent.change(screen.getByLabelText("인증 코드"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "확인하고 계속하기" }));
    await screen.findByRole("alert"); expect(complete).not.toHaveBeenCalled(); expect(refreshUser).not.toHaveBeenCalled();
  });
  it("keeps the current user after a conflicting email and supports retry", async () => {
    sendCode.mockRejectedValueOnce(new Error("already linked"));
    render(<CustomOAuthEmailLink locale="ko" userId={user.id} onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "fan@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "인증 코드 받기" })); await screen.findByRole("alert");
    expect(screen.getByLabelText("이메일")).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "인증 코드 받기" })); await screen.findByLabelText("인증 코드");
    expect(user.id).toBe("did:privy:original");
  });
  it("ignores completion after identity changes", async () => {
    let resolve!: (value: { user: { id: string } }) => void;
    linkWithCode.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const complete = vi.fn(); const view = render(<CustomOAuthEmailLink locale="ko" userId={user.id} onComplete={complete} />);
    await send(); fireEvent.change(screen.getByLabelText("인증 코드"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "확인하고 계속하기" }));
    user = { id: "other" }; view.rerender(<CustomOAuthEmailLink locale="ko" userId="did:privy:original" onComplete={complete} />);
    await act(async () => { resolve({ user: { id: "did:privy:original" } }); });
    await waitFor(() => expect(linkWithCode).toHaveBeenCalledOnce()); expect(complete).not.toHaveBeenCalled();
  });
});

it("allows correcting the email after a code was sent", async () => {
  render(<CustomOAuthEmailLink locale="ko" userId={user.id} onComplete={vi.fn()} />);
  await send(); expect(screen.getByLabelText("이메일")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "이메일 변경" }));
  expect(screen.getByLabelText("이메일")).toBeEnabled(); expect(screen.queryByLabelText("인증 코드")).not.toBeInTheDocument();
});
