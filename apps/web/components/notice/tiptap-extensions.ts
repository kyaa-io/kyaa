import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

import { Node } from "@tiptap/core";
import { noticeMedia, noticePoster } from "./notice-media";

const inlineMedia = Node.create({
  name: "noticeMedia",
  group: "block",
  atom: true,
  addAttributes: () => ({ src: { default: null }, poster: { default: null } }),
  renderHTML({ node }) {
    const media = noticeMedia(node.attrs.src);
    if (!media) return ["span", {}];
    if (media.kind === "youtube") return ["iframe", { src: media.src, title: "YouTube", allowfullscreen: "true", style: "width:100%;aspect-ratio:16/9;border:0" }];
    return ["video", { src: media.src, poster: noticePoster(node.attrs.poster), controls: true, muted: true, playsinline: true, preload: "metadata", style: "display:block;max-width:100%;max-height:70vh;margin:auto" }];
  },
});

export const noticeExtensions = [
  inlineMedia,
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    link: false,
    underline: false,
  }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: { target: "_blank", rel: "noreferrer" },
  }),
  Underline,
  Image.configure({ inline: false, allowBase64: false }),
];
