"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWaveMediaUpload } from "@/features/content-safety/ui/use-wave-media-upload";
import type { RichPostBody } from "./use-rich-post-body";

/**
 * mobile-media uploads of one write form (existing policy: photo 8MB, mp4/mov video 50MB, one video alone).
 * A finished upload becomes an attachment at the cursor. Taking it out of the document cancels the upload.
 */
export function useRichPostUploads({ purpose, limit, body }: { purpose: "group_post" | "fan_post"; limit: number; body: RichPostBody }) {
  const upload = useWaveMediaUpload(purpose, limit);
  const inserted = useRef(new Map<string, string>());
  const [previews, setPreviews] = useState<Readonly<Record<string, string>>>({});
  const urls = useRef(new Set<string>());
  useEffect(() => { const created = urls.current; return () => { created.forEach(url => URL.revokeObjectURL(url)); created.clear(); }; }, []);
  const { insertAttachment, attachments, latestAttachments } = body;
  useEffect(() => {
    for (const item of upload.items) {
      const media = item.media;
      if (media?.state !== "ready" || inserted.current.has(media.assetId)) continue;
      inserted.current.set(media.assetId, item.key);
      const url = URL.createObjectURL(item.file);
      urls.current.add(url);
      setPreviews(current => ({ ...current, [media.assetId]: url }));
      insertAttachment({ assetId: media.assetId, kind: media.kind });
    }
  }, [upload.items, insertAttachment]);
  useEffect(() => {
    const present = new Set(latestAttachments.current.map(item => item.assetId));
    for (const [assetId, key] of inserted.current) {
      if (present.has(assetId)) continue;
      inserted.current.delete(assetId);
      upload.remove(key);
    }
    // `upload.remove` changes on each render; the document is what triggers this.
  }, [attachments]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingItems = upload.items.filter(item => item.failed || item.media?.state !== "ready");
  return {
    add: upload.add,
    retry: upload.retry,
    remove: upload.remove,
    /** Rows still uploading or failed. Finished uploads live in the document. */
    pendingItems,
    invalid: upload.invalid,
    busy: upload.busy || upload.items.some(item => !item.failed && item.media?.state !== "ready"),
    failed: upload.items.some(item => item.failed),
    previewOf: useCallback((assetId: string) => previews[assetId], [previews]),
    /** After a save: the server owns the files now, so leaving the screen must not cancel them. */
    commit: () => { upload.items.forEach(item => upload.markUsed(item.key)); inserted.current.clear(); },
  };
}
