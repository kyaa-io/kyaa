import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmailLoginForm } from "./email-login-form";
import { APP_LOCALES } from "@/i18n/locales";
import { emailLoginCopy } from "@/i18n/catalogs/components__email-login";
afterEach(() => vi.unstubAllGlobals());
it("labels both fields and prevents duplicate submits while showing credential failures inline", async () => {
  let complete!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { complete = resolve; })); vi.stubGlobal("fetch", fetcher);
  render(<EmailLoginForm locale="ko" disabled={false} />);
  fireEvent.click(screen.getByRole("button", { name: "이메일로 계속하기" }));
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "member@example.test" } });
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
  const form = screen.getByLabelText("이메일").closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "로그인 중" })).toBeDisabled();
  complete(new Response(null, { status: 401 }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("이메일과 비밀번호"));
  expect(screen.getByRole("button", { name: "로그인", exact: true })).toBeEnabled();
});
it("has complete copy in every supported locale", () => {
  for (const locale of APP_LOCALES) expect(emailLoginCopy(locale).every(value => value.trim().length > 0)).toBe(true);
});
