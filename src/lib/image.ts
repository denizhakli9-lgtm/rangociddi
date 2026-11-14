const MAX_EDGE = { logo: 512, staff: 640, cover: 1920, gallery: 1600 } as const;
const QUALITY = 0.82;

export type ImageKind = keyof typeof MAX_EDGE;

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

export async function compressImage(file: File, kind: ImageKind): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const max = MAX_EDGE[kind];
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob = await toBlob(canvas, 'image/webp');
  // Older Safari silently falls back to PNG; JPEG would drop logo transparency, so keep the original PNG.
  if (!blob || blob.type !== 'image/webp') {
    blob = file.type === 'image/png' ? null : await toBlob(canvas, 'image/jpeg');
  }
  if (!blob || (scale === 1 && blob.size >= file.size)) return file;
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type });
}
