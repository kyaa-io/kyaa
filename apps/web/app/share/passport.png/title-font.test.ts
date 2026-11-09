import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_LOCALES, type AppLocale } from "@/i18n/locales";
import { copyFor } from "@/features/community-stamps/ui/shared-passport-copy";
import { TITLE_IMAGES, titleFontFile } from "./title-font";

/** Code points a TrueType font maps (cmap formats 4 and 12). */
function codePoints(file: Buffer): Set<number> {
  const out = new Set<number>(), tables = file.readUInt16BE(4);
  let cmap = -1;
  for (let i = 0; i < tables; i++) if (file.toString("ascii", 12 + i * 16, 16 + i * 16) === "cmap") cmap = file.readUInt32BE(20 + i * 16);
  const count = file.readUInt16BE(cmap + 2);
  for (let i = 0; i < count; i++) {
    const at = cmap + file.readUInt32BE(cmap + 8 + i * 8), format = file.readUInt16BE(at);
    if (format === 4) {
      const segments = file.readUInt16BE(at + 6) / 2, ends = at + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, ranges = deltas + segments * 2;
      for (let s = 0; s < segments; s++) {
        const end = file.readUInt16BE(ends + s * 2), start = file.readUInt16BE(starts + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          if (file.readUInt16BE(ranges + s * 2) === 0) { if (((c + file.readInt16BE(deltas + s * 2)) & 0xffff) !== 0) out.add(c); }
          else out.add(c);
        }
      }
    } else if (format === 12) {
      const groups = file.readUInt32BE(at + 12);
      for (let g = 0; g < groups; g++) { const start = file.readUInt32BE(at + 16 + g * 12), end = file.readUInt32BE(at + 20 + g * 12); for (let c = start; c <= end; c++) out.add(c); }
    }
  }
  return out;
}

describe("shared Passport link-preview headline fonts", () => {
  it.each(APP_LOCALES.filter((locale) => !TITLE_IMAGES[locale]))("%s: the font has every glyph of the headline", (locale) => {
    const glyphs = codePoints(readFileSync(join(process.cwd(), titleFontFile(locale))));
    const missing = [...copyFor(locale).title].filter((char) => !glyphs.has(char.codePointAt(0)!));
    expect(missing).toEqual([]);
  });
  it.each(Object.entries(TITLE_IMAGES))("%s: the headline picture shows the catalog's headline and has its stated size", (locale, image) => {
    expect(image.text).toBe(copyFor(locale as AppLocale).title);
    const png = readFileSync(join(process.cwd(), image.file));
    expect([png.readUInt32BE(16) / 4, png.readUInt32BE(20) / 4].map(Math.round)).toEqual([image.width, image.height]);
  });
});
