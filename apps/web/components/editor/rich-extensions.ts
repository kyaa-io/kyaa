import { Node } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { normalizeRichLink } from "./rich-document";

/** Media reference. It holds an id only; the reader's own post data decides what can be drawn. HTML paste can't create it. */
export const RichAttachment = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() { return { assetId: { default: null, rendered: false }, kind: { default: "image", rendered: false } }; },
  parseHTML() { return []; },
  renderHTML() { return ["div", { "data-rich-attachment": "" }]; },
});

/** YouTube reference. It holds the video id only; pasted embeds and addresses go through the toolbar's check. */
export const RichYouTube = Node.create({
  name: "youtube",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() { return { videoId: { default: null, rendered: false } }; },
  parseHTML() { return []; },
  renderHTML() { return ["div", { "data-rich-youtube": "" }]; },
});

export const richTextExtensions = [
  StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, strike: false, link: false, underline: false }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    linkOnPaste: true,
    defaultProtocol: "https",
    protocols: ["https"],
    isAllowedUri: (url) => typeof url === "string" && /^https:\/\//i.test(url) && normalizeRichLink(url) !== null,
    HTMLAttributes: { target: "_blank", rel: "nofollow ugc noopener noreferrer" },
  }),
  Underline,
];

export const richDocumentExtensions = [...richTextExtensions, RichAttachment, RichYouTube];
