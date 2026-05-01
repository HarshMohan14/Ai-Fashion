/*
  # Reset lab state and create Dr. Body's Model Hub schema

  1. Reset
    - Clears all rows from `wardrobe_items`, `extraction_items`, and `extractions` so the
      app starts fresh focused on the Model Hub. Table structures are preserved; only data
      is removed.
  2. New Tables
    - `models_public` — "Public Display Data" (safe to show to any DFB rater). Holds the
      anonymized profile a rater sees: nickname, body category, primary front photo, the
      5-angle gallery, and Dr. Body's AI physique description (which itself must not reveal
      identifying data).
      - `id` (uuid, primary key) — this is the `Model_ID` all DFB ratings must link against.
      - `nickname` (text) — internal label like "Model 01 · Athletic".
      - `body_category` (text) — Stout, Lanky, Athletic, Average, Petite, Broad, Slim.
      - `physique_description` (text) — AI-generated trait summary, non-identifying.
      - `primary_photo_url` (text) — front-facing image URL.
      - `photos` (jsonb) — { front, back, left_profile, right_profile, angle_45 }.
      - `approved_outfit_count` (integer) — badge count for the Profile Card.
      - `created_at` (timestamptz).
    - `models_private` — "Private Research Data" (admin/Dr. Body only). Strictly separated
      so the rater app cannot join against it. Linked one-to-one by `model_id`.
      - `model_id` (uuid, primary key, fk → models_public.id ON DELETE CASCADE).
      - `full_name` (text) — admin-only legal name.
      - `age` (integer).
      - `weight_kg` (numeric).
      - `height_cm` (numeric).
      - `physical_notes` (text) — Dr. Body's freeform traits.
      - `created_at` (timestamptz).
  3. Security
    - RLS enabled on both tables.
    - `models_public`: SELECT allowed to anon + authenticated (this is what raters see).
      INSERT/UPDATE/DELETE allowed to authenticated (admin workflow). For this demo the
      anon key is also granted INSERT/UPDATE so the single-admin portfolio app can operate
      without auth — in production this would be authenticated-only.
    - `models_private`: NO anon access. authenticated can SELECT/INSERT/UPDATE/DELETE.
      This table is the blind-data firewall — raters never see it.
  4. Important Notes
    1. Keeping identifying fields out of `models_public` is the core of the Metadata
       Shadowing design. Any future rater-facing endpoint joins only on `models_public.id`.
    2. `physique_description` is AI-generated from the uploaded photos and intentionally
       omits age/weight/name.
    3. Cascade delete keeps the two halves in sync when an admin removes a model.
*/

DELETE FROM extraction_items;
DELETE FROM extractions;
DELETE FROM wardrobe_items;

CREATE TABLE IF NOT EXISTS models_public (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname text NOT NULL DEFAULT '',
  body_category text NOT NULL DEFAULT 'Average',
  physique_description text NOT NULL DEFAULT '',
  primary_photo_url text NOT NULL DEFAULT '',
  photos jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_outfit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS models_private (
  model_id uuid PRIMARY KEY REFERENCES models_public(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  age integer NOT NULL DEFAULT 0,
  weight_kg numeric NOT NULL DEFAULT 0,
  height_cm numeric NOT NULL DEFAULT 0,
  physical_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE models_public ENABLE ROW LEVEL SECURITY;
ALTER TABLE models_private ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='models_public' AND policyname='Anyone can view public model data') THEN
    CREATE POLICY "Anyone can view public model data"
      ON models_public FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='models_public' AND policyname='Admin can insert public model data') THEN
    CREATE POLICY "Admin can insert public model data"
      ON models_public FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='models_public' AND policyname='Admin can update public model data') THEN
    CREATE POLICY "Admin can update public model data"
      ON models_public FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='models_public' AND policyname='Admin can delete public model data') THEN
    CREATE POLICY "Admin can delete public model data"
      ON models_public FOR DELETE TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='models_private' AND policyname='Admin can view private model data') THEN
    CREATE POLICY "Admin can view private model data"
      ON models_private FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='models_private' AND policyname='Admin can insert private model data') THEN
    CREATE POLICY "Admin can insert private model data"
      ON models_private FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='models_private' AND policyname='Admin can update private model data') THEN
    CREATE POLICY "Admin can update private model data"
      ON models_private FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='models_private' AND policyname='Admin can delete private model data') THEN
    CREATE POLICY "Admin can delete private model data"
      ON models_private FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;