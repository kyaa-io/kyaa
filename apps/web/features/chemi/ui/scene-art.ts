// These landscapes already have a desktop master. The remaining landscapes have a 2× export.
export function landscapeSrcSet(src: string) {
  if (src.includes("-wide-") || src.endsWith("hero-elina-l-v1.webp") || src.endsWith("scene-yuna-l.webp")) return src;
  return `${src} 1x, ${src.replace(".webp", "@2x.webp")} 2x`;
}
