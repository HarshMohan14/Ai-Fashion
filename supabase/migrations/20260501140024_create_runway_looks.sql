/*
  # Dr. Stylist's Runway table

  1. New Tables
    - `runway_looks` — each record is a generated full-model editorial image.
      - `id` (uuid, pk)
      - `model_id` (uuid, fk → models_public.id, ON DELETE SET NULL)
      - `theme` (text) — e.g. "Summer Streetwear"
      - `item_ids` (uuid[]) — references to wardrobe_items that went into the look
      - `item_snapshot` (jsonb) — preserved array of items (name, image, category) in case
        the wardrobe changes later
      - `prompt` (text) — the full prompt sent to Nano Banana
      - `image_url` (text) — the generated image (data URL or external)
      - `status` (text) — 'draft' | 'in_review' | 'approved'
      - `feedback` (text) — last regeneration note, if any
      - `mocked` (boolean) — true if rendered via local simulator
      - `model_used` (text) — generation model id / 'simulated'
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled. Demo-friendly permissive policies (anon + authenticated) matching the
      rest of the lab; production would tighten INSERT/UPDATE/DELETE to authenticated.
*/

CREATE TABLE IF NOT EXISTS runway_looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES models_public(id) ON DELETE SET NULL,
  theme text NOT NULL DEFAULT '',
  item_ids uuid[] NOT NULL DEFAULT '{}',
  item_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  feedback text NOT NULL DEFAULT '',
  mocked boolean NOT NULL DEFAULT false,
  model_used text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE runway_looks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='runway_looks' AND policyname='Anyone can view runway looks') THEN
    CREATE POLICY "Anyone can view runway looks"
      ON runway_looks FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='runway_looks' AND policyname='Admin can insert runway looks') THEN
    CREATE POLICY "Admin can insert runway looks"
      ON runway_looks FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='runway_looks' AND policyname='Admin can update runway looks') THEN
    CREATE POLICY "Admin can update runway looks"
      ON runway_looks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='runway_looks' AND policyname='Admin can delete runway looks') THEN
    CREATE POLICY "Admin can delete runway looks"
      ON runway_looks FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;