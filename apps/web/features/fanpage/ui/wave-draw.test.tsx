import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { waveDrawCopy } from "@/i18n/catalogs/features__fanpage__wave-draw";
import { WAVE_PRIZES, type WaveDrawResponse } from "../domain/wave-draw";
import { WaveDraw } from "./wave-draw";

const state = vi.hoisted(() => ({ data: {} as WaveDrawResponse, retry: vi.fn(), owner: "viewer" }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: true, user: { id: state.owner }, getAccessToken: async () => "token" }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ownerId: state.owner, generation: 0, ready: true }) }));
vi.mock("./use-fanpage-resource", () => ({ useFanpageResource: () => ({ retry: state.retry, state: { status: "ready", data: state.data } }) }));
vi.mock("@/features/benefit/ui/raffle-result-reveal", () => ({ RaffleResultReveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const fetchMock = vi.fn<typeof fetch>();
const copy = waveDrawCopy("ko");
const response = (ok: boolean) => ({ ok, json: async () => ok ? { success: true } : { error: { code: "PRIVATE_DETAIL" } } }) as Response;
const body = (index = 0) => JSON.parse(fetchMock.mock.calls[index][1]!.body as string);
function select(index: number) { fireEvent.click(screen.getByRole("button", { name: new RegExp(WAVE_PRIZES[index].title) })); }
beforeEach(() => {
  state.data = { entry: null, tickets: 3, draw: null, result: { status: "not_entered" }, published: [] };
  state.owner = "viewer"; state.retry.mockReset(); fetchMock.mockReset(); fetchMock.mockResolvedValue(response(true)); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(APP_LOCALES)("shows all ten source prizes in %s", locale => {
  render(<WaveDraw locale={locale} />);
  expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(10);
  expect(screen.getByRole("button", { name: waveDrawCopy(locale).save })).toBeDisabled();
});
it("limits choices to three, supports reordering and removal, and saves ordered preferences", async () => {
  render(<WaveDraw locale="ko" />); select(0); select(1); select(2);
  expect(screen.getAllByRole("button", { pressed: false }).every(button => button.hasAttribute("disabled"))).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: `${WAVE_PRIZES[2].title} · ${copy.earlier}` }));
  fireEvent.click(screen.getByRole("button", { name: `${WAVE_PRIZES[1].title} · ${copy.remove}` }));
  select(3); fireEvent.click(screen.getByRole("button", { name: copy.save }));
  await waitFor(() => expect(state.retry).toHaveBeenCalledOnce());
  expect(body()).toEqual({ preferences: ["tshirt", "phonecase", "hoodie"], requestId: expect.any(String) });
  expect(fetchMock.mock.calls[0][1]?.method).toBe("PUT");
  expect(screen.getByText(copy.saved)).toBeInTheDocument();
});
it("retains the request ID after failure and prevents duplicate saves while busy", async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<WaveDraw locale="ko" />); select(0); select(1); select(2);
  const save = screen.getByRole("button", { name: copy.save }); fireEvent.click(save);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(save).toBeDisabled(); fireEvent.click(save); expect(fetchMock).toHaveBeenCalledOnce();
  const first = body(); await act(async () => { finish(response(false)); });
  expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(3);
  expect(screen.queryByText("PRIVATE_DETAIL")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: copy.save }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); expect(body(1)).toEqual(first);
});
it("prevents zero-ticket entry and clears draft selections when the account changes", () => {
  state.data.tickets = 0; const view = render(<WaveDraw locale="ko" />); select(0); select(1); select(2);
  expect(screen.getByRole("button", { name: copy.save })).toBeDisabled();
  state.owner = "another"; view.rerender(<WaveDraw locale="ko" />);
  expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
});
it("closes selection after the draw and does not expose an unrevealed result", () => {
  state.data.draw = { id: "draw", executedAt: new Date().toISOString(), revealedThrough: 0 };
  state.data.result = { status: "pending" }; render(<WaveDraw locale="ko" />);
  expect(screen.getByText(copy.waiting)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: copy.save })).not.toBeInTheDocument();
  expect(screen.queryByText(copy.won)).not.toBeInTheDocument();
});
