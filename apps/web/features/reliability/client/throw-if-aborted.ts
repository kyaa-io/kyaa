export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason === undefined ? new DOMException("Aborted", "AbortError") : signal.reason;
}
