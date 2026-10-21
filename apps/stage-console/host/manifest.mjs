import { z } from "zod";
const asset = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value
        .split("/")
        .some((part) => !part || part === ".." || part === ".") &&
      !value.includes(":"),
  );
const cue = z
  .object({
    id: z.string().min(1).max(100),
    type: z.enum(["slide", "html", "video", "live", "hold"]),
    label: z.string().min(1),
    section: z.string(),
    time: z.string().optional(),
    asset: asset.optional(),
    thumbnail: asset.optional(),
    slideIndex: z.number().int().min(0).max(199).optional(),
    script: z.array(z.string()),
    nextOnEnd: z.string().optional(),
    layout: z.enum(["triptych", "performance"]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (["slide", "html", "video"].includes(value.type) && !value.asset)
      ctx.addIssue({ code: "custom", message: "Asset required" });
    if (value.type === "html" && value.slideIndex === undefined)
      ctx.addIssue({ code: "custom", message: "HTML slide index required" });
  });
export const manifestSchema = z
  .object({
    version: z.literal(1),
    revision: z.string(),
    title: z.string(),
    cues: z.array(cue).min(1).max(200),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set(value.cues.map((c) => c.id));
    if (
      ids.size !== value.cues.length ||
      value.cues.some((c) => c.nextOnEnd && !ids.has(c.nextOnEnd))
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate or missing cue reference",
      });
  });
