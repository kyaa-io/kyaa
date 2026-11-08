import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UploadProgressList, uploadPercent, waveUploadRow } from "./upload-progress";

afterEach(cleanup);
const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });

it("maps an upload task to its visible state", () => {
  expect(waveUploadRow({ key: "a", file, progress: 0.42 })).toEqual({ key: "a", name: "photo.jpg", progress: 0.42, state: "uploading" });
  expect(waveUploadRow({ key: "a", file, uploaded: true }).state).toBe("processing");
  expect(waveUploadRow({ key: "a", file, uploaded: true, media: { state: "ready" } }).state).toBe("done");
  expect(waveUploadRow({ key: "a", file, uploaded: true, failed: true }).state).toBe("failed");
  expect([uploadPercent(undefined), uploadPercent(1.4), uploadPercent(0.426)]).toEqual([null, 100, 43]);
});

it("shows a spinner with the percent and a bar while bytes move, never just a loading word", () => {
  render(<UploadProgressList locale="ko" items={[{ key: "a", name: "photo.jpg", state: "uploading", progress: 0.42 }]} />);
  expect(screen.getByRole("status")).toHaveTextContent("photo.jpg 올리는 중42%");
  expect(screen.getByRole("progressbar", { name: "photo.jpg" })).toHaveAttribute("aria-valuenow", "42");
});

it("keeps the bar moving without a number while the server prepares the file", () => {
  render(<UploadProgressList locale="ko" items={[{ key: "a", name: "clip.mp4", state: "processing", progress: 1 }]} />);
  expect(screen.getByRole("status")).toHaveTextContent("clip.mp4 · 준비하는 중");
  expect(screen.getByRole("progressbar")).toHaveAttribute("data-indeterminate");
  expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
});

it("says a failure out loud with retry and remove, and marks a finished file", () => {
  const onRetry = vi.fn(), onRemove = vi.fn();
  render(<UploadProgressList locale="ko" onRetry={onRetry} onRemove={onRemove} items={[{ key: "a", name: "a.jpg", state: "failed" }, { key: "b", name: "b.jpg", state: "done" }]} />);
  expect(screen.getByRole("alert")).toHaveTextContent("a.jpg 올리기에 실패했어요.");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(onRetry).toHaveBeenCalledWith("a");
  expect(screen.getAllByRole("button", { name: "삭제" })).toHaveLength(1);
  expect(screen.getByText("b.jpg · 올렸어요")).toBeInTheDocument();
});
