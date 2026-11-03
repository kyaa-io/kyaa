import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemberDmEntry } from "./member-dm-entry";
const mock = vi.hoisted(() => ({ push: vi.fn(), request: vi.fn(), ready: true, authenticated: true, ownerKey: "viewer" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mock.push }) }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({ useGroupRequest: () => mock }));
const id = "10000000-0000-4000-8000-000000000001";
const valid = { profile: { id }, isSelf: false, capabilities: { canRequestDm: true }, dm: { conversationId: null } };
beforeEach(() => { mock.push.mockReset(); mock.request.mockReset(); mock.ready = true; mock.authenticated = true; mock.ownerKey = "viewer"; });
afterEach(cleanup);
it("checks the selected identity before opening the existing social profile", async () => {
 mock.request.mockResolvedValue(valid); render(<MemberDmEntry profileId={id} nickname="별빛" locale="ko" />);
 fireEvent.click(screen.getByRole("button", { name: "별빛 · 대화하기" }));
 await waitFor(() => expect(mock.push).toHaveBeenCalledWith(`/my/friends?locale=ko&profileId=${id}`));
 expect(mock.request).toHaveBeenCalledWith(`/api/me/social/profiles/${id}?locale=ko`);
});
it.each([{...valid,isSelf:true},{...valid,capabilities:{canRequestDm:false}},{...valid,profile:{id:"20000000-0000-4000-8000-000000000002"}}])("does not open self, unavailable or mismatched profiles", async value => {
 mock.request.mockResolvedValue(value); render(<MemberDmEntry profileId={id} nickname="별빛" locale="ko" />);
 fireEvent.click(screen.getByRole("button", { name: "별빛 · 대화하기" }));
 expect(await screen.findByRole("alert")).toBeInTheDocument(); expect(mock.push).not.toHaveBeenCalled();
});
it("allows existing conversations and rejects blocked/private failures; guests have no action", async () => {
 mock.request.mockResolvedValue({...valid,capabilities:{canRequestDm:false},dm:{conversationId:id}});
 const view = render(<MemberDmEntry profileId={id} nickname="별빛" locale="ko" />); fireEvent.click(screen.getByRole("button", { name: "별빛 · 대화하기" })); await waitFor(() => expect(mock.push).toHaveBeenCalledTimes(1));
 mock.push.mockClear(); mock.request.mockRejectedValue(new Error("forbidden")); fireEvent.click(screen.getByRole("button", { name: "별빛 · 대화하기" })); expect(await screen.findByRole("alert")).toBeInTheDocument(); expect(mock.push).not.toHaveBeenCalled();
 mock.authenticated = false; view.rerender(<MemberDmEntry profileId={id} nickname="별빛" locale="ko" />); expect(screen.queryByRole("button")).toBeNull();
});
it("does not navigate after the session owner changes while permission is loading", async () => {
 let resolve!: (value: typeof valid) => void;
 mock.request.mockReturnValue(new Promise(done => { resolve = done; }));
 const view = render(<MemberDmEntry profileId={id} nickname="별빛" locale="ko" />);
 fireEvent.click(screen.getByRole("button", { name: "별빛 · 대화하기" }));
 mock.ownerKey = "other"; view.rerender(<MemberDmEntry profileId={id} nickname="별빛" locale="ko" />);
 resolve(valid); await waitFor(() => expect(screen.getByRole("button", { name: "별빛 · 대화하기" })).toBeEnabled());
 expect(mock.push).not.toHaveBeenCalled();
});
it("keeps keyboard focus during a pending check and ignores repeated activation", async () => {
 let resolve!: (value: typeof valid) => void;
 mock.request.mockReturnValue(new Promise(done => { resolve = done; }));
 render(<MemberDmEntry profileId={id} nickname="별빛" locale="ko" />);
 const button = screen.getByRole("button", { name: "별빛 · 대화하기" }); button.focus(); fireEvent.click(button); fireEvent.click(button);
 expect(button).toHaveFocus(); expect(button).toHaveAttribute("aria-busy", "true"); expect(mock.request).toHaveBeenCalledTimes(1);
 resolve({ ...valid, isSelf: true }); await screen.findByRole("alert"); expect(button).toHaveFocus();
});
