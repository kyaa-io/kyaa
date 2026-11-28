"use client";

import { useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";

export async function renderResultImage(title: string, detail: string, art?: string, reversed = false, frame = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.fillStyle = "#fff5f8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let top = 560;
  if (art) {
    const image = new Image();
    image.src = art;
    await image.decode();
    if (frame) {
      ctx.drawImage(image, 0, 0, 1080, 1920);
      top = 780;
    } else {
    const scale = Math.min(900 / image.naturalWidth, 940 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.save();
    ctx.translate(540, 580);
    if (reversed) ctx.rotate(Math.PI);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
    top = 620 + height / 2;
    }
  }

  ctx.fillStyle = "#1c1c1c";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  function write(value: string, font: string, lineHeight: number, maxLines: number) {
    if (!ctx) return;
    ctx.font = font;
    const lines: string[] = [];
    for (const paragraph of value.split("\n")) {
      let line = "";
      for (const word of paragraph.match(/\S+\s*|\s+/gu) ?? []) {
        if (line && ctx.measureText(line + word.trimEnd()).width > (frame ? 610 : 872)) {
          lines.push(line.trim());
          line = "";
        }
        for (const char of word) {
          if (line && ctx.measureText(line + char).width > (frame ? 610 : 872)) {
            lines.push(line.trim());
            line = "";
          }
          line += char;
        }
      }
      lines.push(line.trim());
    }
    lines.slice(0, maxLines).forEach((line, index) => {
      ctx.fillText(index === maxLines - 1 && lines.length > maxLines ? line.trimEnd() + "…" : line, 540, top, frame ? 610 : 900);
      top += lineHeight;
    });
  }

  write(title, "bold 70px system-ui", 92, 2);
  if (frame) top = 945;
  else top += 24;
  if (frame) {
    const paragraphs = detail.split("\n");
    const dates = paragraphs.length > 1 && paragraphs.at(-1)?.includes(" · ") ? paragraphs.pop() : undefined;
    write(paragraphs.join("\n"), "38px system-ui", 48, 3);
    if (dates) {
      top = 1249;
      write(dates, "36px system-ui", 46, 3);
    }
  } else write(detail, "44px system-ui", 60, Math.min(7, Math.floor((1710 - top) / 60)));
  const logo = new Image();
  logo.src = "/images/guest-home/kyaa-wordmark.svg";
  await logo.decode();
  const logoWidth = 130;
  ctx.drawImage(logo, frame ? 475 : 990 - logoWidth, frame ? 1470 : 1740, logoWidth, logoWidth * logo.naturalHeight / logo.naturalWidth);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG unavailable")), "image/png");
  });
  return new File([blob], "kyaa-chemi.png", { type: "image/png" });
}

export function SaveResultImage({ title, detail = "", art, reversed, frame = false, primary = false }: {
  title: string;
  detail?: string;
  art?: string;
  reversed?: boolean;
  primary?: boolean;
  frame?: boolean;
}) {
  const text = useReadingCopy();
  const [prepared, setPrepared] = useState<{ key: string; file: File | null }>();
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const key = JSON.stringify([title, detail, art, reversed, frame, retry]);
  useEffect(() => {
    let current = true;
    renderResultImage(title, detail, art, reversed, frame)
      .then((file) => { if (current) setPrepared({ key, file }); })
      .catch(() => { if (current) setPrepared({ key, file: null }); });
    return () => { current = false; };
  }, [key, title, detail, art, reversed, frame]);

  async function save() {
    if (prepared?.key !== key) return;
    const file = prepared.file;
    if (!file) {
      showFanToast({ title: text("cardSaveFailed"), tone: "error" });
      setRetry(retry + 1);
      return;
    }
    setSaving(true);
    try {
      const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (appleMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        showFanToast({ title: text("cardSaveFailed"), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <FanAction variant={primary ? "primary" : "secondary"} fullWidth={primary}
      loading={saving || prepared?.key !== key} onClick={() => void save()}>
      {text("saveResultImage")}
    </FanAction>
  );
}
