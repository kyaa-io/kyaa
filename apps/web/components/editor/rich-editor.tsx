"use client";
import { Button as BaseButton } from "@base-ui/react/button";
import { Toggle } from "@base-ui/react/toggle";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Underline as UnderlineIcon, CirclePlay, Video, X } from "lucide-react";
import { createContext, useContext, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ComponentType, type ReactNode, type Ref } from "react";
import type { AppLocale } from "@/i18n/locales";
import { editorText } from "./editor-copy";
import type { RichAttachmentRenderer } from "./rich-body";
import { normalizeRichLink, parseYouTubeVideoId, RICH_DOCUMENT_MAX_YOUTUBE, type RichAttachment, type RichDocument } from "./rich-document";
import { RichAttachment as AttachmentNode, RichYouTube as YouTubeNode, richTextExtensions } from "./rich-extensions";
import { RichYouTubeEmbed } from "./rich-youtube";
import styles from "./rich-text.module.css";

export type RichEditorHandle = { insertAttachment: (attachment: RichAttachment) => void; focus: () => void };
export type RichEditorMedia = {
  /** Photo button. The file list is handed to the caller, which uploads and then calls `insertAttachment`. */
  onPickPhotos?: (files: File[]) => void;
  /** Video button: mp4 or mov, one file. */
  onPickVideo?: (file: File) => void;
  /** When set, the button stays pressable and reports why instead of opening the picker. */
  photoBlocked?: boolean;
  videoBlocked?: boolean;
  /** The limits are still unknown: the buttons wait instead of answering with a limit that may be wrong. */
  disabled?: boolean;
  onBlocked?: () => void;
  photoAccept?: string;
  multiplePhotos?: boolean;
  renderAttachment?: RichAttachmentRenderer;
  /** Upload rows, under the writing area. */
  status?: ReactNode;
};
export type RichEditorProps = {
  label: string;
  value: RichDocument;
  onChange: (value: RichDocument) => void;
  locale: AppLocale;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** Text length shown under the writing area, and the limit it is compared with. */
  length?: number;
  maxLength?: number;
  media?: RichEditorMedia;
  allowYouTube?: boolean;
  handleRef?: Ref<RichEditorHandle>;
};

type ViewContext = { locale: AppLocale; renderAttachment?: RichAttachmentRenderer; disabled: boolean };
const NodeViews = createContext<ViewContext | null>(null);

function RemoveNode({ onRemove, locale }: { onRemove: () => void; locale: AppLocale }) {
  return <BaseButton className={styles.nodeRemove} aria-label={editorText(locale, "remove")} onClick={onRemove}><X aria-hidden="true" /></BaseButton>;
}
function AttachmentView({ node, deleteNode }: ReactNodeViewProps) {
  const view = useContext(NodeViews);
  if (!view) return null;
  return <NodeViewWrapper className={styles.nodeView} data-kind={node.attrs.kind} contentEditable={false}>
    {view.renderAttachment?.({ assetId: String(node.attrs.assetId), kind: node.attrs.kind })}
    {!view.disabled && <RemoveNode locale={view.locale} onRemove={deleteNode} />}
  </NodeViewWrapper>;
}
function YouTubeView({ node, deleteNode }: ReactNodeViewProps) {
  const view = useContext(NodeViews);
  if (!view) return null;
  return <NodeViewWrapper className={styles.nodeView} data-kind="youtube" contentEditable={false}>
    <RichYouTubeEmbed videoId={String(node.attrs.videoId)} locale={view.locale} interactive={false} />
    {!view.disabled && <RemoveNode locale={view.locale} onRemove={deleteNode} />}
  </NodeViewWrapper>;
}

const countYouTube = (json: { type?: string; content?: unknown[] }): number =>
  (json.type === "youtube" ? 1 : 0) + ((json.content ?? []) as { type?: string; content?: unknown[] }[]).reduce((total, child) => total + countYouTube(child), 0);

type Prompt = { kind: "link" | "youtube"; value: string; error: string };

export function RichEditor({ label, value, onChange, locale, placeholder, disabled = false, invalid = false, autoFocus = false, length, maxLength, media, allowYouTube = true, handleRef }: RichEditorProps) {
  const labelId = useId(), photoInput = useRef<HTMLInputElement>(null), videoInput = useRef<HTMLInputElement>(null), promptInput = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef(JSON.stringify(value)), change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const extensions = useMemo(() => [
    ...richTextExtensions,
    AttachmentNode.extend({ addNodeView() { return ReactNodeViewRenderer(AttachmentView); } }),
    YouTubeNode.extend({ addNodeView() { return ReactNodeViewRenderer(YouTubeView); } }),
  ], []);
  const editor = useEditor({
    extensions,
    content: value,
    immediatelyRender: false,
    editable: !disabled,
    autofocus: autoFocus ? "end" : false,
    editorProps: { attributes: { class: styles.editable ?? "", role: "textbox", "aria-multiline": "true", "aria-labelledby": labelId, ...(invalid ? { "aria-invalid": "true" } : {}) } },
    onUpdate: ({ editor: active }) => {
      const next = active.getJSON() as RichDocument;
      lastEmitted.current = JSON.stringify(next);
      change.current(next);
    },
  }, [extensions]);
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  useEffect(() => {
    if (!editor || editor.isDestroyed || JSON.stringify(value) === lastEmitted.current) return;
    lastEmitted.current = JSON.stringify(value);
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  useEffect(() => { if (prompt) promptInput.current?.focus(); }, [prompt?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useImperativeHandle(handleRef, () => ({
    insertAttachment: (attachment) => { editor?.chain().focus("end").insertContent({ type: "attachment", attrs: { ...attachment } }).createParagraphNear().run(); },
    focus: () => { editor?.commands.focus(); },
  }), [editor]);
  const active = useEditorState({ editor, selector: ({ editor: current }) => current ? {
    bold: current.isActive("bold"), italic: current.isActive("italic"), underline: current.isActive("underline"),
    heading: current.isActive("heading", { level: 2 }), subheading: current.isActive("heading", { level: 3 }),
    bulletList: current.isActive("bulletList"), orderedList: current.isActive("orderedList"), quote: current.isActive("blockquote"),
    link: current.isActive("link"), empty: current.isEmpty,
  } : null });
  const context = useMemo<ViewContext>(() => ({ locale, renderAttachment: media?.renderAttachment, disabled }), [locale, media?.renderAttachment, disabled]);

  const openPrompt = (kind: Prompt["kind"]) => {
    const href = kind === "link" ? String(editor?.getAttributes("link").href ?? "") : "";
    setPrompt(current => current?.kind === kind ? null : { kind, value: href, error: "" });
  };
  const applyPrompt = () => {
    if (!prompt || !editor) return;
    if (prompt.kind === "link") {
      const href = normalizeRichLink(prompt.value);
      if (!href) { setPrompt({ ...prompt, error: editorText(locale, "linkInvalid") }); return; }
      const chain = editor.chain().focus();
      (editor.state.selection.empty && !editor.isActive("link")
        ? chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
        : chain.extendMarkRange("link").setLink({ href })).run();
    } else {
      const videoId = parseYouTubeVideoId(prompt.value);
      if (!videoId) { setPrompt({ ...prompt, error: editorText(locale, "youtubeInvalid") }); return; }
      if (countYouTube(editor.getJSON()) >= RICH_DOCUMENT_MAX_YOUTUBE) { setPrompt({ ...prompt, error: editorText(locale, "youtubeLimit", [RICH_DOCUMENT_MAX_YOUTUBE]) }); return; }
      editor.chain().focus().insertContent({ type: "youtube", attrs: { videoId } }).createParagraphNear().run();
    }
    setPrompt(null);
  };
  const formatting: { key: keyof NonNullable<typeof active>; copy: Parameters<typeof editorText>[1]; icon: ComponentType; run: () => void }[] = [
    { key: "bold", copy: "bold", icon: Bold, run: () => editor?.chain().focus().toggleBold().run() },
    { key: "italic", copy: "italic", icon: Italic, run: () => editor?.chain().focus().toggleItalic().run() },
    { key: "underline", copy: "underline", icon: UnderlineIcon, run: () => editor?.chain().focus().toggleUnderline().run() },
    { key: "heading", copy: "heading", icon: Heading2, run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: "subheading", copy: "subheading", icon: Heading3, run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
    { key: "bulletList", copy: "bulletList", icon: List, run: () => editor?.chain().focus().toggleBulletList().run() },
    { key: "orderedList", copy: "orderedList", icon: ListOrdered, run: () => editor?.chain().focus().toggleOrderedList().run() },
    { key: "quote", copy: "quote", icon: Quote, run: () => editor?.chain().focus().toggleBlockquote().run() },
  ];
  const over = length !== undefined && maxLength !== undefined && length > maxLength;
  return <div className={styles.editor} data-invalid={invalid || over || undefined} data-rich-editor="">
    <span id={labelId} className={styles.fileInput}>{label}</span>
    <div className={styles.toolbar} role="toolbar" aria-label={editorText(locale, "toolbar")}>
      <div className={styles.group}>
        {formatting.map(({ key, copy, icon: Icon, run }) => <Toggle key={key} className={styles.tool} aria-label={editorText(locale, copy)} title={editorText(locale, copy)} pressed={Boolean(active?.[key])} disabled={disabled || !editor} onClick={run}><Icon aria-hidden="true" /></Toggle>)}
        <Toggle className={styles.tool} aria-label={editorText(locale, "link")} title={editorText(locale, "link")} pressed={Boolean(active?.link)} aria-expanded={prompt?.kind === "link"} disabled={disabled || !editor} onClick={() => openPrompt("link")}><Link2 aria-hidden="true" /></Toggle>
      </div>
      {(media?.onPickPhotos || media?.onPickVideo || allowYouTube) && <div className={styles.group}>
        {media?.onPickPhotos && <>
          <BaseButton className={styles.tool} aria-disabled={media.photoBlocked || undefined} disabled={disabled || media.disabled || !editor} onClick={() => { if (media.photoBlocked) media.onBlocked?.(); else photoInput.current?.click(); }}><ImagePlus aria-hidden="true" />{editorText(locale, "photo")}</BaseButton>
          <input ref={photoInput} className={styles.fileInput} tabIndex={-1} type="file" accept={media.photoAccept ?? "image/jpeg,image/png,image/webp"} multiple={media.multiplePhotos ?? true} aria-label={editorText(locale, "photo")} disabled={disabled || media.photoBlocked} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) media.onPickPhotos?.(files); }} />
        </>}
        {media?.onPickVideo && <>
          <BaseButton className={styles.tool} aria-disabled={media.videoBlocked || undefined} disabled={disabled || media.disabled || !editor} onClick={() => { if (media.videoBlocked) media.onBlocked?.(); else videoInput.current?.click(); }}><Video aria-hidden="true" />{editorText(locale, "video")}</BaseButton>
          <input ref={videoInput} className={styles.fileInput} tabIndex={-1} type="file" accept="video/mp4,video/quicktime" aria-label={editorText(locale, "video")} disabled={disabled || media.videoBlocked} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) media.onPickVideo?.(file); }} />
        </>}
        {allowYouTube && <BaseButton className={styles.tool} aria-expanded={prompt?.kind === "youtube"} disabled={disabled || !editor} onClick={() => openPrompt("youtube")}><CirclePlay aria-hidden="true" />{editorText(locale, "youtube")}</BaseButton>}
      </div>}
    </div>
    {prompt && <div className={styles.prompt}>
      <input ref={promptInput} type="url" inputMode="url" autoComplete="off" aria-label={editorText(locale, prompt.kind === "link" ? "linkAddress" : "youtubeAddress")} placeholder={prompt.kind === "link" ? "https://" : "https://youtu.be/"} value={prompt.value} aria-invalid={Boolean(prompt.error) || undefined}
        onChange={event => setPrompt({ ...prompt, value: event.target.value, error: "" })}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); applyPrompt(); } if (event.key === "Escape") { event.preventDefault(); setPrompt(null); editor?.commands.focus(); } }} />
      <BaseButton onClick={applyPrompt}>{editorText(locale, "insert")}</BaseButton>
      {prompt.kind === "link" && active?.link && <BaseButton onClick={() => { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); setPrompt(null); }}>{editorText(locale, "removeLink")}</BaseButton>}
      <BaseButton onClick={() => { setPrompt(null); editor?.commands.focus(); }}>{editorText(locale, "cancel")}</BaseButton>
      {prompt.error && <p role="alert" className={styles.promptError}>{prompt.error}</p>}
    </div>}
    <div className={styles.surface}>
      {placeholder && (active ? active.empty : editor?.isEmpty) && <span className={styles.placeholder} aria-hidden="true">{placeholder}</span>}
      <NodeViews.Provider value={context}><EditorContent editor={editor} /></NodeViews.Provider>
    </div>
    {media?.status}
    {length !== undefined && maxLength !== undefined && <div className={styles.foot} data-over={over || undefined}>{length.toLocaleString(locale)} / {maxLength.toLocaleString(locale)}</div>}
  </div>;
}
