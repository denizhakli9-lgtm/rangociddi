import { useState } from 'react';
import { checkImage, uploadBusinessImage } from '@/lib/api';
import { compressImage } from '@/lib/image';
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
      return await uploadBusinessImage(businessId, await compressImage(file, kind), kind);
    } catch (e) {
      toast(friendlyError(e), 'error');
      return null;
    } finally {
      setUploading(null);
    }
  };

  return { upload, uploading };
}
