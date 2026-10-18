import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createMobileBenefitAdminHandlers, type MobileBenefitAdminDependencies } from "./admin-routes";

const actor = "11111111-1111-4111-8111-111111111111";
const allowlist = "22222222-2222-4222-8222-222222222222";
const benefit = "33333333-3333-4333-8333-333333333333";
const policy = "44444444-4444-4444-8444-444444444444";
const deps: MobileBenefitAdminDependencies = { authorize: vi.fn(async () => ({ appUserId: actor, allowlistId: allowlist, email: "admin@example.test", role: "admin" as const })), rpc: vi.fn() };
const api = createMobileBenefitAdminHandlers(deps);
const request = (path: string, init?: RequestInit) => new Request(`https://byus.test${path}`, { headers: { authorization: "Bearer admin", "content-type": "application/json", "x-correlation-id": "55555555-5555-4555-8555-555555555555" }, ...init });
beforeEach(() => vi.clearAllMocks());

describe("mobile benefit admin routes", () => {
  it("creates a disabled version with audited reason and complete outcome configuration", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ policyId: policy, policyVersion: "gift-v2", enabled: false });
    const response = await api.createPolicy(request("/api/admin/mobile-benefits/policies", { method: "POST", body: JSON.stringify({ benefitId: benefit, mode: "instant_draw", policyVersion: "gift-v2", ticketCost: 2, dailyLimit: 3, allowPaidTickets: false, testerOnly: true, opensAt: "2026-10-12T00:00:00.000Z", closesAt: "2026-10-13T00:00:00.000Z", resultAt: null, recipientDeadlinePolicy: null, outcomes: [{ outcome: "won", weight: 1, inventoryLimit: 1, fulfillmentMethod: "digital", imageUrl: null }, { outcome: "not_selected", weight: 9, inventoryLimit: null, fulfillmentMethod: null, imageUrl: null }], reason: "새 즉시 추첨 버전을 등록합니다." }) }));
    expect(response.status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("create_admin_mobile_benefit_policy", expect.objectContaining({ p_actor_app_user_id: actor, p_actor_admin_allowlist_id: allowlist, p_policy_version: "gift-v2", p_daily_limit: 3, p_recipient_deadline_policy: null, p_reason: "새 즉시 추첨 버전을 등록합니다." }));
  });
  it("creates complete localized consent copy before activation", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ version: "2026-10-v1", active: false });
    const document = { title: "배송 정보 수집 동의", body: "경품 배송을 위해 정보를 수집합니다.", documentUrl: null, items: [{ id: "recipient", label: "이름과 연락처 수집", required: true }] };
    const response = await api.createConsent(request("/api/admin/mobile-benefits/consents", { method: "POST", body: JSON.stringify({ version: "2026-10-v1", effectiveAt: "2026-10-12T00:00:00.000Z", documents: { ko: document, en: { ...document, title: "Recipient information consent", body: "We collect recipient information for delivery.", items: [{ id: "recipient", label: "Collect name and phone", required: true }] } }, reason: "배송 동의문 신규 버전을 등록합니다." }) }));
    expect(response.status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("create_admin_mobile_benefit_consent", expect.objectContaining({ p_version: "2026-10-v1", p_documents: expect.objectContaining({ ko: document }) }));
  });
  it("blocks viewer writes before the database mutation", async () => {
    vi.mocked(deps.authorize).mockResolvedValue({ appUserId: actor, allowlistId: allowlist, email: "viewer@example.test", role: "viewer" });
    const response = await api.togglePolicy(request(`/api/admin/mobile-benefits/policies/${policy}`, { method: "PATCH", body: JSON.stringify({ enabled: true, reason: "검증된 정책을 활성화합니다." }) }), policy);
    expect(response.status).toBe(403); expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("reads operations for viewers and rejects duplicate filters", async () => {
    vi.mocked(deps.authorize).mockResolvedValue({ appUserId: actor, allowlistId: allowlist, email: "viewer@example.test", role: "viewer" });
    vi.mocked(deps.rpc).mockResolvedValue({ operations: [] });
    expect((await api.operations(request(`/api/admin/mobile-benefits/operations?policyId=${policy}&limit=50`))).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("read_admin_mobile_benefit_operations", expect.objectContaining({ p_policy_id: policy, p_limit: 50 }));
    expect((await api.operations(request("/api/admin/mobile-benefits/operations?limit=10&limit=20"))).status).toBe(400);
  });
});
