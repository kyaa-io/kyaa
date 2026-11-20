export async function saveAdviceImage(src: string, date: string, line: string) {
  const art = new Image();
  art.src = src;
  await art.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Canvas unavailable");
  const imageHeight = Math.round(canvas.width * art.height / art.width);
  const rows = [];
  let row = "";
  ctx.font = "500 42px sans-serif";
  for (const char of Array.from(line)) {
    if (row && ctx.measureText(row + char).width > 832) {
      rows.push(row);
      row = "";
    }
    row += char;
  }
  rows.push(row);
  canvas.height = imageHeight + 180 + rows.length * 60;
  ctx.fillStyle = "#fff9f5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(art, 0, 0, canvas.width, imageHeight);
  ctx.fillStyle = "#443238";
  ctx.font = "500 42px sans-serif";
  rows.forEach((text, i) => ctx.fillText(text, 64, imageHeight + 88 + i * 60));
  ctx.font = "28px sans-serif";
  ctx.fillText(date, 64, canvas.height - 48);
  ctx.textAlign = "right";
  ctx.font = "bold 36px sans-serif";
  ctx.fillText("kyaa", 896, canvas.height - 48);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(value => value ? resolve(value) : reject(Error("PNG unavailable")), "image/png"));
  const file = new File([blob], "kyaa-advice.png", { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
}
