/**
 * The whole video file is large, and the same video is mounted again whenever the page re-keys itself (auth settling, session generation), so
 * its blob is shared per asset, owner and session generation: one download, one object URL for the viewers mounted at the same time.
 * With no viewer left it is kept only for a moment (a re-keyed viewer mounts right after the old one leaves), never longer: it must not
 * outlive a sign-out or a permission change, and coming back to the post asks the server again. The session provider calls
 * `purgeVideoBlobs` on every owner, generation or sign-in change, which aborts pending downloads and revokes finished ones, viewers or not.
 */
type Entry = { promise: Promise<string>; url?: string; refs: number; timer?: ReturnType<typeof setTimeout>; controller: AbortController };
const videoBlobs = new Map<string, Entry>();
const revokeEntry = (entry: Pick<Entry, "promise" | "url">) => { if (entry.url) URL.revokeObjectURL(entry.url); else entry.promise.then(url => URL.revokeObjectURL(url), () => undefined); };
const VIDEO_BLOB_KEEP_MS = 1500;

export function acquireVideoBlob(key: string, load: (signal: AbortSignal) => Promise<string>) {
  let entry = videoBlobs.get(key);
  if (!entry) {
    const controller = new AbortController();
    const created: Entry = { promise: load(controller.signal), refs: 0, controller };
    created.promise.then(url => { created.url = url; }, () => { if (videoBlobs.get(key) === created) videoBlobs.delete(key); });
    videoBlobs.set(key, created); entry = created;
  }
  if (entry.timer) { clearTimeout(entry.timer); entry.timer = undefined; }
  entry.refs += 1;
  return entry.promise;
}

/** The owner changed or signed out: the blob must not outlive it, so it is aborted and revoked at once. */
export function dropVideoBlob(key: string) {
  const entry = videoBlobs.get(key); if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  videoBlobs.delete(key); entry.controller.abort(); revokeEntry(entry);
}

export function releaseVideoBlob(key: string) {
  const entry = videoBlobs.get(key); if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  entry.timer = setTimeout(() => {
    if (videoBlobs.get(key) !== entry || entry.refs > 0) return;
    dropVideoBlob(key);
  }, VIDEO_BLOB_KEEP_MS);
}

/** Every entry, with or without a viewer: called by the session provider when the owner, the session generation or the sign-in state changes. */
export function purgeVideoBlobs() { for (const key of [...videoBlobs.keys()]) dropVideoBlob(key); }
