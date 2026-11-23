import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useChemiNickname } from "./use-chemi-nickname";

vi.mock("@/features/auth/client/cognito-auth", () => ({
  // 실제 인증 훅처럼 렌더마다 새 함수를 돌려준다.
  useByUsAuth: () => ({ ready: true, authenticated: true, getAccessToken: async () => "session" }),
}));
afterEach(() => vi.unstubAllGlobals());

it("re-renders do not cancel the profile request, so the nickname arrives", async () => {
  const request = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return Response.json({ profile: { nickname: "달빛 응원단" } });
  });
  vi.stubGlobal("fetch", request);
  const { result, rerender } = renderHook(() => useChemiNickname());
  rerender();
  rerender();
  await waitFor(() => expect(result.current).toBe("달빛 응원단"));
  expect(request).toHaveBeenCalledTimes(1);
});
