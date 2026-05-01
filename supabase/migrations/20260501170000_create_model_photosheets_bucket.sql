/*
  # Public storage bucket for model photosheets

  1. New Storage Bucket
    - `model-photosheets` for uploaded 5-angle model contact sheets.
    - Public read URLs are used as Runway reference_image_1.

  2. Security
    - Demo-friendly policies match the current app posture:
      anon and authenticated users can read, upload, update, and delete objects
      in this bucket.
    - Production should replace mutation policies with an admin role.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'model-photosheets',
  'model-photosheets',
  true,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Anyone can read model photosheets'
  ) THEN
    CREATE POLICY "Anyone can read model photosheets"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'model-photosheets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admin can upload model photosheets'
  ) THEN
    CREATE POLICY "Admin can upload model photosheets"
      ON storage.objects FOR INSERT
      TO anon, authenticated
      WITH CHECK (bucket_id = 'model-photosheets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admin can update model photosheets'
  ) THEN
    CREATE POLICY "Admin can update model photosheets"
      ON storage.objects FOR UPDATE
      TO anon, authenticated
      USING (bucket_id = 'model-photosheets')
      WITH CHECK (bucket_id = 'model-photosheets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admin can delete model photosheets'
  ) THEN
    CREATE POLICY "Admin can delete model photosheets"
      ON storage.objects FOR DELETE
      TO anon, authenticated
      USING (bucket_id = 'model-photosheets');
  END IF;
END $$;
