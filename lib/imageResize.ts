/**
 * Reads a picked image file and returns it as a data URL no wider than
 * `maxWidth`, re-encoded as WebP where the browser can (PNG otherwise, so
 * transparency survives). Product and content pictures are stored inline
 * in the database, so this is what keeps a 4 MB phone photo from becoming
 * a 5 MB row.
 */
export async function fileToResizedDataUrl(file: File, maxWidth = 1200, quality = 0.86): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("تعذّر قراءة الصورة."));
      el.src = url;
    });
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذّر معالجة الصورة.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL("image/webp", quality);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
