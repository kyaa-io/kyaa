import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuthError } from "@/features/auth/domain/auth-errors";
import { createOnboardingHandlers } from "./onboarding-route";

const requestId = "af040000-0000-4000-8000-000000000001";
const passportId = "af040000-0000-4000-8000-000000000002";
const body = { nickname: "Fan12", requestId, policyVersion: "2026-10-11", termsAccepted: true, privacyAccepted: true };
const result = { profile: { completed: true, nickname: "Fan12" }, policyVersion: "2026-10-11", passport: { id: passportId, issuedAt: "2026-10-11T00:00:00+00:00" } };

function fixture(data: unknown = result) {
  const authorize = vi.fn(async () => ({ appUserId: "canonical-owner" }));
  const rpc = vi.fn(async () => ({ data, error: null as { message: string } | null }));
  return { authorize, rpc, handlers: createOnboardingHandlers({ authorize, rpc }) };
}

function request(input: unknown = body) {
  return new Request("https://byus.test/api/me/account-onboarding", {
    method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify(input),
  });
}

describe("account onboarding", () => {
  it("uses the authenticated owner and returns the server-issued passport", async () => {
    const { handlers, rpc } = fixture();
    const response = await handlers.complete(request({ ...body, nickname: "  Ｆａｎ１２  " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(rpc).toHaveBeenCalledWith("complete_owned_account_onboarding", {
      p_app_user_id: "canonical-owner", p_request_id: requestId, p_nickname: "Fan12",
      p_terms_accepted: true, p_privacy_accepted: true, p_policy_version: "2026-10-11",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("reads an existing profile without treating it as a newly issued account passport", async () => {
    const { handlers, rpc } = fixture({ ...result, passport: null });
    const response = await handlers.get(new Request("https://byus.test/api/me/account-onboarding?appUserId=other"));
    expect(await response.json()).toEqual({ ...result, passport: null });
    expect(rpc).toHaveBeenCalledWith("get_owned_account_onboarding", { p_app_user_id: "canonical-owner" });
  });

  it.each([
    [{ ...body, termsAccepted: false }, "CONSENT_REQUIRED"],
    [{ ...body, privacyAccepted: false }, "CONSENT_REQUIRED"],
    [{ ...body, appUserId: "other" }, "INVALID_REQUEST"],
    [{ ...body, requestId: "invalid" }, "INVALID_REQUEST"],
    [{ ...body, nickname: "x".repeat(9000) }, "INVALID_REQUEST"],
    [{ ...body, nickname: "admin" }, "NICKNAME_PROHIBITED"],
  ])("rejects untrusted or incomplete input %j", async (input, code) => {
    const { handlers, rpc } = fixture();
    const response = await handlers.complete(request(input));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["ONBOARDING_REQUEST_CONFLICT", 409, "REQUEST_CONFLICT"],
    ["ONBOARDING_POLICY_CHANGED", 400, "ONBOARDING_POLICY_CHANGED"],
    ["FAN005_NICKNAME_TAKEN", 409, "NICKNAME_TAKEN"],
    ["FAN_WEB_ACTIVE_ACCOUNT_REQUIRED", 403, "FORBIDDEN"],
  ])("maps %s without exposing database details", async (message, status, code) => {
    const { handlers, rpc } = fixture();
    rpc.mockResolvedValue({ data: null, error: { message: `${message}: private fixture details` } });
    const response = await handlers.complete(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code } });
  });

  it("denies an unavailable account before calling a database function", async () => {
    const { handlers, authorize, rpc } = fixture();
    authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 403, "private"));
    expect((await handlers.complete(request())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed on an unexpected database response", async () => {
    const { handlers } = fixture({ ...result, privateDetails: "never disclose" });
    const response = await handlers.get(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "PROFILE_UNAVAILABLE" } });
  });

  it("checks availability without accepting an owner supplied by the caller", async () => {
    const { handlers, rpc } = fixture({ available: false, reason: "taken" });
    const response = await handlers.availability(new Request("https://byus.test/api/me/account-onboarding/nickname?nickname=Fan12&appUserId=other"));
    expect(await response.json()).toEqual({ available: false, reason: "taken" });
    expect(rpc).toHaveBeenCalledWith("read_owned_nickname_availability", { p_app_user_id: "canonical-owner", p_nickname: "Fan12" });
  });

  it.each(["", "nickname=", "nickname=a&nickname=b", "nickname=admin"])("rejects invalid availability input: %s", async (query) => {
    const { handlers, rpc } = fixture();
    const response = await handlers.availability(new Request(`https://byus.test/api/me/account-onboarding/nickname?${query}`));
    expect((await response.json()).available).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
