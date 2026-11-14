/*
  # Fix business media ownership policies

  1. Problem
     - The three write policies on storage.objects called
       `storage.foldername(b.name)` -- the business NAME -- instead of the object
       path, so the ownership check never matched the uploaded path. The control
       was effectively absent and owner uploads failed closed.
  2. Change
     - Recreate INSERT / UPDATE / DELETE policies comparing the first path segment
       of the object name to the owning business id.
*/

DROP POLICY IF EXISTS "business_media_insert_owner" ON storage.objects;
DROP POLICY IF EXISTS "business_media_update_owner" ON storage.objects;
DROP POLICY IF EXISTS "business_media_delete_owner" ON storage.objects;

CREATE POLICY "business_media_insert_owner"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'business-media'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.owner_id = auth.uid()
        AND (storage.foldername(storage.objects.name))[1] = b.id::text
    )
  );

CREATE POLICY "business_media_update_owner"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'business-media'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.owner_id = auth.uid()
        AND (storage.foldername(storage.objects.name))[1] = b.id::text
    )
  )
  WITH CHECK (
    bucket_id = 'business-media'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.owner_id = auth.uid()
        AND (storage.foldername(storage.objects.name))[1] = b.id::text
    )
  );

CREATE POLICY "business_media_delete_owner"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'business-media'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.owner_id = auth.uid()
        AND (storage.foldername(storage.objects.name))[1] = b.id::text
    )
  );
