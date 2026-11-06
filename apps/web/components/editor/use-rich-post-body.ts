"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import type { RichEditorHandle } from "./rich-editor";
import { plainTextToRichDocument, readRichDocument, richDocumentAttachments, richDocumentHasContent, richDocumentPlainText, sanitizeRichDocument, type RichAttachment, type RichDocument } from "./rich-document";

export type RichPostInitial = { body?: string; bodyDoc?: unknown; attachments?: readonly RichAttachment[] };

/** Opens a stored post: its document when it has a readable one, otherwise its plain text. Attachments missing from the document follow the text, so editing never drops them. */
export function initialRichDocument({ body = "", bodyDoc, attachments = [] }: RichPostInitial): RichDocument {
  const stored = readRichDocument(bodyDoc);
  if (!stored) return plainTextToRichDocument(body, attachments);
  const present = new Set(richDocumentAttachments(stored).map(item => item.assetId));
  const missing = attachments.filter(item => !present.has(item.assetId.toLowerCase()));
  return missing.length ? { type: "doc", content: [...stored.content, ...missing.map(item => ({ type: "attachment", attrs: { assetId: item.assetId, kind: item.kind } }))] } : stored;
}

export type RichPostBody = ReturnType<typeof useRichPostBody>;

/** Document state of one write form. `document` is sanitized the same way the server does, so what is sent is what was checked. */
export function useRichPostBody(initial: RichPostInitial) {
  const [raw, setRaw] = useState<RichDocument>(() => initialRichDocument(initial));
  const [baseline, setBaseline] = useState(() => JSON.stringify(sanitizeOrNull(raw)));
  const handle = useRef<RichEditorHandle | null>(null);
  const sanitized = useMemo(() => sanitizeOrNull(raw), [raw]);
  const attachments = useMemo(() => sanitized ? richDocumentAttachments(sanitized) : [], [sanitized]);
  const latest = useRef(attachments);
  const onChange = useCallback((next: RichDocument) => {
    const clean = sanitizeOrNull(next);
    if (clean) latest.current = richDocumentAttachments(clean);
    setRaw(next);
  }, []);
  const insertAttachment = useCallback((attachment: RichAttachment) => {
    latest.current = [...latest.current, attachment];
    if (handle.current) handle.current.insertAttachment(attachment);
    else setRaw(current => ({ type: "doc", content: [...current.content, { type: "attachment", attrs: { ...attachment } }, { type: "paragraph" }] }));
  }, []);
  const reset = useCallback((next: RichPostInitial = {}) => {
    const value = initialRichDocument(next);
    latest.current = richDocumentAttachments(value);
    setRaw(value);
    setBaseline(JSON.stringify(sanitizeOrNull(value)));
  }, []);
  const plainText = sanitized ? richDocumentPlainText(sanitized) : "";
  return {
    /** Current raw value for `RichEditor`. */
    value: raw,
    onChange,
    handle,
    /** null when the document is over the stored size. */
    document: sanitized,
    plainText,
    attachments,
    /** Attachments including one inserted a moment ago, before React has rendered it. */
    latestAttachments: latest,
    insertAttachment,
    hasContent: sanitized ? richDocumentHasContent(sanitized) : true,
    tooLarge: sanitized === null,
    dirty: JSON.stringify(sanitized) !== baseline,
    reset,
  };
}

function sanitizeOrNull(value: RichDocument): RichDocument | null {
  try { return sanitizeRichDocument(value); } catch { return null; }
}
