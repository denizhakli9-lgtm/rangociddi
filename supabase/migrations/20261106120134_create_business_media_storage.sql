/*
# Business media storage

1. Bucket `business-media` (public read: logos and photos are public marketing content).
   Limited to 5 MB JPEG / PNG / WebP images.
2. Security: files live under `<business_id>/...`; only the owner of that business may upload,
   replace or delete files in its folder.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('business-media', 'business-media', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

DROP POLICY IF EXISTS "business_media_read" ON storage.objects;
CREATE POLICY "business_media_read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'business-media');

DROP POLICY IF EXISTS "business_media_insert_owner" ON storage.objects;
CREATE POLICY "business_media_insert_owner" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'business-media' AND EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id::text = (storage.foldername(name))[1] AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "business_media_update_owner" ON storage.objects;
CREATE POLICY "business_media_update_owner" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'business-media' AND EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id::text = (storage.foldername(name))[1] AND b.owner_id = auth.uid()))
  WITH CHECK (bucket_id = 'business-media' AND EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id::text = (storage.foldername(name))[1] AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "business_media_delete_owner" ON storage.objects;
CREATE POLICY "business_media_delete_owner" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'business-media' AND EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id::text = (storage.foldername(name))[1] AND b.owner_id = auth.uid()));
