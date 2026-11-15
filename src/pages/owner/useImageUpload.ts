import { useState } from 'react';
import { checkImage, uploadBusinessImage } from '@/lib/api';
import { compressImage, ImageProcessingError } from '@/lib/image';
import { friendlyError } from '@/lib/errors';
import { tr } from '@/i18n/tr';
import { useToast } from '@/contexts/ToastContext';

type Kind = Parameters<typeof uploadBusinessImage>[2];

export function useImageUpload(businessId: string) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState<Kind | null>(null);

  const upload = async (file: File | undefined, kind: Kind): Promise<string | null> => {
    if (!file) return null;
    const check = checkImage(file);
    if (check === 'type') {
      toast(tr.errors.uploadType, 'error');
      return null;
    }
    if (check === 'size') {
      toast(tr.errors.uploadSize, 'error');
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
