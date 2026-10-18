import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createMobileStoreAdminHandlers, type MobileStoreAdminDependencies } from "./admin-routes";
const actor = "57000000-0000-4000-8000-000000000001", allowlist = "57000000-0000-4000-8000-000000000002", transactionId = "57000000-0000-4000-8000-000000000003";
function request(body: unknown) { return new Request("https://byus.test/api/admin/mobile-store/support-settlements", { method: "POST", headers: { authorization: "Bearer admin", "content-type": "application/json", "x-correlation-id": "57000000-0000-4000-8000-000000000004" }, body: JSON.stringify(body) }); }
describe("mobile store admin routes", () => {
  it("creates an audited sandbox product policy with a revision fence", async () => {
    const deps: MobileStoreAdminDependencies = { authorize: vi.fn(async () => ({ appUserId: actor, allowlistId: allowlist, email: "admin@example.test", role: "admin" as const })), rpc: vi.fn(async () => ({ id:transactionId, environment:"sandbox" })) };
    const response=await createMobileStoreAdminHandlers(deps).createProductPolicy(request({store:"apple",productId:"tickets.100",policyVersion:"2026-10",ticketQuantity:100,supportRateBps:500,rewardPolicyVersion:1,effectiveAt:"2026-10-12T00:00:00Z",expectedCurrentPolicyId:null,reason:"신규 샌드박스 상품 정책을 등록합니다."}));
    expect(response.status).toBe(201);expect(deps.rpc).toHaveBeenCalledWith("mobile_store_admin_create_product_policy",expect.objectContaining({p_store:"apple",p_product_id:"tickets.100",p_expected_current_policy_id:null}));
  });
  it("enrolls a sandbox tester through the admin audit path",async()=>{
    const deps:MobileStoreAdminDependencies={authorize:vi.fn(async()=>({appUserId:actor,allowlistId:allowlist,email:"admin@example.test",role:"admin"as const})),rpc:vi.fn(async()=>({appUserId:transactionId,enabled:true}))};
    const response=await createMobileStoreAdminHandlers(deps).setSandboxTester(request({appUserId:transactionId,enabled:true,reason:"내부 결제 검증 계정을 활성화합니다."}));
    expect(response.status).toBe(200);expect(deps.rpc).toHaveBeenCalledWith("mobile_store_admin_set_sandbox_tester",expect.objectContaining({p_app_user_id:transactionId,p_enabled:true}));
  });
  it("records reviewed settlement evidence against a verified transaction", async () => {
    const deps: MobileStoreAdminDependencies = { authorize: vi.fn(async () => ({ appUserId: actor, allowlistId: allowlist, email: "admin@example.test", role: "admin" as const })), rpc: vi.fn(async () => ({ transactionId, supportKrw: 100, status: "settled" })) };
    const response = await createMobileStoreAdminHandlers(deps).recordSupportSettlement(request({ transactionId, supportKrw: 100, evidenceAt: "2026-10-12T00:00:00Z", evidenceReference: "bank:fixture:100", reason: "후원 정산 증거를 확인하고 기록합니다." }));
    expect(response.status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("mobile_store_admin_record_support_settlement", expect.objectContaining({ p_transaction_id: transactionId, p_support_krw: 100, p_evidence_reference: "bank:fixture:100" }));
  });
});
