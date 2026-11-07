"use client";
import { useState, type FormEvent, type Ref } from "react";
import { PostEditorForm, PostEditorSelect } from "@/features/fan-posts/ui/post-editor-form";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import type { AppLocale } from "@/i18n/locales";
import { boardCopy } from "./board-copy";
import { groupsCopy } from "./copy";
import { useGroupPostBody, type GroupPostAssetRef } from "./group-post-body";
import { managementCopy } from "./management-copy";

export type GroupPostInput = { title: string; bodyDoc: unknown; visibility: string; category: string; assetIds: string[] };
type EditedPost = { title: string; body: string; bodyDoc?: unknown; bodyDocUnavailable?: boolean; visibility: string; category?: "notice" | "free"; assets?: GroupPostAssetRef[] };

export function GroupPostComposer({ locale, post, heading, canWriteNotice, busy, formRef, onSubmit, onCancel }: { locale: AppLocale; post?: EditedPost; heading?: string; canWriteNotice: boolean; busy: boolean; formRef?: Ref<HTMLFormElement>; onSubmit: (input: GroupPostInput) => Promise<boolean>; onCancel: (dirty: boolean) => void }) {
  const m = managementCopy(locale), b = boardCopy(locale), t = groupsCopy(locale), [title, setTitle] = useState(post?.title ?? "");
  const [visibility, setVisibility] = useState(post?.visibility === "members" ? "members" : "public"), [category, setCategory] = useState(post?.category ?? "free");
  const body = useGroupPostBody({ locale, label: m.body, disabled: busy, initial: post && { body: post.body, bodyDoc: post.bodyDoc, bodyDocUnavailable: post.bodyDocUnavailable, assets: post.assets } });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || body.blocked || !title.trim()) return;
    const saved = await onSubmit({ title, ...body.submission(), visibility, category });
    if (saved) body.commit();
  };
  const cancel = () => onCancel(body.dirty || title !== (post?.title ?? "") || visibility !== (post?.visibility === "members" ? "members" : "public") || category !== (post?.category ?? "free"));
  return <PostEditorForm locale={locale} formRef={formRef} onSubmit={event => void submit(event)} heading={heading} backLabel={b.back} onBack={cancel} disabled={busy} titleLabel={m.title} title={title} onTitleChange={setTitle} titleMaxLength={100} titleAutoFocus={!post} bodyLabel={m.body} body={body.field}
    options={<>
      <PostEditorSelect label={contentCopy(locale).visibility} value={visibility} disabled={busy} onChange={setVisibility} options={[{ value: "public", label: b.public }, { value: "members", label: b.members }]} />
      <PostEditorSelect label={t.board} value={category} disabled={busy} onChange={setCategory} options={[{ value: "free", label: b.free }, ...(canWriteNotice ? [{ value: "notice" as const, label: b.notice }] : [])]} />
    </>}
    cancelLabel={t.cancel} onCancel={cancel} cancelDisabled={busy} submitLabel={post ? m.save : m.write} submitDisabled={busy || body.blocked || !title.trim()} reward={!post} />;
}
