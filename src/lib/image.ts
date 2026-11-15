const MAX_EDGE = { logo: 512, staff: 640, cover: 1920, gallery: 1600 } as const;
const QUALITY = 0.82;
const MAX_BYTES = 5 * 1024 * 1024;

export type ImageKind = keyof typeof MAX_EDGE;

/**
 * Thrown when a picture cannot be re-encoded in the browser. The original bytes are never
 * uploaded instead, because they may carry EXIF data such as GPS location and device details.
 * `reason` is 'size' when the re-encoded picture is still too large, otherwise 'decode'.
 */
export class ImageProcessingError extends Error {
  readonly reason: 'decode' | 'size';
  constructor(reason: 'decode' | 'size') {
    super('VEYRA_INVALID_IMAGE');
    this.name = 'ImageProcessingError';
    this.reason = reason;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * Downscales and re-encodes a picture through a canvas. Only the drawn pixels are kept, so
 * EXIF/GPS and other metadata are always stripped. Rejects with ImageProcessingError when
 * the file cannot be decoded or encoded.
 */
export async function compressImage(file: File, kind: ImageKind): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageProcessingError('decode');
  }
  const max = MAX_EDGE[kind];
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new ImageProcessingError('decode');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob = await toBlob(canvas, 'image/webp');
  // Older Safari cannot encode WebP. PNG input stays PNG so logo transparency is kept; everything else becomes JPEG.
  if (!blob || blob.type !== 'image/webp') {
    const fallback = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    blob = await toBlob(canvas, fallback);
    if (blob && blob.type !== fallback) blob = null;
  }
  if (!blob) throw new ImageProcessingError('decode');
  if (blob.size > MAX_BYTES) throw new ImageProcessingError('size');
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type });
}
