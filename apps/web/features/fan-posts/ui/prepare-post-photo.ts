// Leave room for multipart headers below the hosting platform's 4.5 MB limit.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const MAX_POST_PHOTO_BYTES = 20 * 1024 * 1024;

export async function preparePostPhoto(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES) return file;
  if (file.size > MAX_POST_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("INVALID_IMAGE");
  const url = URL.createObjectURL(file), image = new Image();
  const canvas = document.createElement("canvas");
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("INVALID_IMAGE");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("INVALID_IMAGE");
    let scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.9));
      if (!blob?.size) throw new Error("INVALID_IMAGE");
      if (blob.size <= MAX_UPLOAD_BYTES) return new File([blob], blob.type === "image/webp" ? "photo.webp" : "photo.png", { type: blob.type });
      scale *= 0.75;
    }
    throw new Error("BODY_TOO_LARGE");
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}
