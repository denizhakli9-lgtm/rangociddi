import { useState } from 'react';
import { checkImage, uploadBusinessImage } from '@/lib/api';
import { compressImage, ImageProcessingError } from '@/lib/image';
import { friendlyError } from '@/lib/errors';
import { tr } from '@/i18n/tr';
import { useToast } from '@/contexts/ToastContext';

type Kind = Parameters<typeof uploadBusinessImage>[2];

/** Largest original picture accepted for compression (memory guard; the uploaded file is at most 5 MB). */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

export function useImageUpload(businessId: string) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState<Kind | null>(null);

  const upload = async (file: File | undefined, kind: Kind): Promise<string | null> => {
    if (!file) return null;
    // Only the type is checked up front: phone camera photos (24/48 MP iPhones) are often larger than the
    // 5 MB upload limit before compression, which compressImage enforces on its output. The original size
    // is only capped as a memory guard.
    if (checkImage(file) === 'type') {
      toast(tr.errors.uploadType, 'error');
      return null;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      // Owner panel is Turkish-only; the 5 MB message would be wrong here (smaller originals are compressed).
      toast('Görsel çok büyük (en fazla 40 MB). Daha küçük bir fotoğraf seçin.', 'error');
      return null;
    }
    setUploading(kind);
    try {
      // compressImage never falls back to the original bytes, so EXIF/GPS data cannot reach the public bucket.
      return await uploadBusinessImage(businessId, await compressImage(file, kind), kind);
    } catch (e) {
      if (e instanceof ImageProcessingError) {
        if (import.meta.env.DEV) console.error(e);
        // The file type was already accepted above, so a failure here means the image could not be read or encoded.
        toast(e.reason === 'size' ? tr.errors.uploadSize : tr.errors.VEYRA_INVALID_IMAGE, 'error');
        return null;
      }
      toast(friendlyError(e), 'error');
      return null;
    } finally {
      setUploading(null);
    }
  };

  return { upload, uploading };
}
