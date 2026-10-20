import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { participationScannerCopy } from "./kyaa-wave-participation-copy";
import { ParticipationScanner } from "./kyaa-wave-participation-scanner";

const scanner = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), destroy: vi.fn(), scanImage: vi.fn(), decoded: null as null | ((result: { data: string }) => void) }));
vi.mock("qr-scanner", () => ({ default: class {
  static scanImage = scanner.scanImage;
  constructor(_video: HTMLVideoElement, decoded: (result: { data: string }) => void) { scanner.decoded = decoded; }
  start = scanner.start;
  stop = scanner.stop;
  destroy = scanner.destroy;
} }));
const copy = participationScannerCopy.ko;
const token = "ABC234";
const link = () => `${location.origin}/connect/kyaa-wave/participate?code=${token}`;
const upload = (file: File) => fireEvent.change(screen.getByLabelText(copy.upload), { target: { files: [file] } });
beforeEach(() => { vi.clearAllMocks(); scanner.decoded = null; scanner.start.mockReset().mockResolvedValue(undefined); scanner.scanImage.mockReset(); });
afterEach(cleanup);

describe("Participation QR scanner", () => {
  it("offers image upload when camera permission is denied", async () => {
    scanner.start.mockRejectedValue(new Error("Permission denied"));
    scanner.scanImage.mockResolvedValue({ data: link() });
    const onScan = vi.fn(); const view = render(<ParticipationScanner locale="ko" onScan={onScan} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.cameraError);
    expect(screen.getByRole("button", { name: copy.camera })).toBeEnabled();
    const file = new File(["QR"], "qr.png", { type: "image/png" });
    upload(file);
    await waitFor(() => expect(onScan).toHaveBeenCalledWith(token));
    expect(scanner.scanImage).toHaveBeenCalledWith(file, { returnDetailedScanResult: true });
    view.unmount(); expect(scanner.destroy).toHaveBeenCalled();
  });
  it("rejects foreign QR links and accepts a local participation link, then stops and cleans up", async () => {
    const onScan = vi.fn(); const view = render(<ParticipationScanner locale="ko" onScan={onScan} />);
    await waitFor(() => expect(scanner.start).toHaveBeenCalledOnce());
    act(() => scanner.decoded?.({ data: `https://other.example/connect/kyaa-wave/participate?code=${token}` }));
    expect(screen.getByRole("alert")).toHaveTextContent(copy.invalid);
    expect(onScan).not.toHaveBeenCalled();
    act(() => scanner.decoded?.({ data: link() }));
    expect(onScan).toHaveBeenCalledWith(token); expect(scanner.stop).toHaveBeenCalledOnce();
    act(() => scanner.decoded?.({ data: link() }));
    expect(onScan).toHaveBeenCalledOnce();
    view.unmount(); expect(scanner.destroy).toHaveBeenCalledOnce();
  });
  it("uses the latest callback without reopening the camera", async () => {
    const first = vi.fn(), latest = vi.fn(); const view = render(<ParticipationScanner locale="ko" onScan={first} />);
    await waitFor(() => expect(scanner.start).toHaveBeenCalledOnce());
    view.rerender(<ParticipationScanner locale="ko" onScan={latest} />);
    act(() => scanner.decoded?.({ data: link() }));
    expect(first).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledWith(token);
    expect(scanner.start).toHaveBeenCalledOnce();
  });
  it("destroys the previous scanner before retrying camera access", async () => {
    scanner.start.mockRejectedValueOnce(new Error("denied"));
    render(<ParticipationScanner locale="ko" onScan={vi.fn()} />);
    await screen.findByRole("alert"); fireEvent.click(screen.getByRole("button", { name: copy.camera }));
    await waitFor(() => expect(scanner.start).toHaveBeenCalledTimes(2));
    expect(scanner.destroy).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("button", { name: copy.camera })).not.toBeInTheDocument());
  });
  it("cleans up even when camera startup finishes after unmount", async () => {
    let finish!: () => void;
    scanner.start.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const view = render(<ParticipationScanner locale="ko" onScan={vi.fn()} />);
    await waitFor(() => expect(scanner.start).toHaveBeenCalledOnce()); view.unmount();
    expect(scanner.destroy).toHaveBeenCalled();
    await act(async () => { finish(); });
    expect(scanner.destroy).toHaveBeenCalled();
  });
  it.each([new File(["text"], "text.txt", { type: "text/plain" }), new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })])("rejects unsuitable uploads without decoding ($name)", async file => {
    const onScan = vi.fn(); render(<ParticipationScanner locale="ko" onScan={onScan} />);
    upload(file); expect(await screen.findByRole("alert")).toHaveTextContent(copy.invalid);
    expect(scanner.scanImage).not.toHaveBeenCalled(); expect(onScan).not.toHaveBeenCalled();
  });
  it("reports an unreadable uploaded QR without exposing decoder details", async () => {
    scanner.scanImage.mockRejectedValue(new Error("sensitive decoder details"));
    render(<ParticipationScanner locale="ko" onScan={vi.fn()} />);
    await waitFor(() => expect(scanner.start).toHaveBeenCalledOnce());
    upload(new File(["QR"], "qr.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.invalid);
    expect(scanner.scanImage).toHaveBeenCalledOnce();
    expect(screen.queryByText("sensitive decoder details")).not.toBeInTheDocument();
  });
});
