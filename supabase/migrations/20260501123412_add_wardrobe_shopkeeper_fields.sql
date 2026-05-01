/*
  # Dr. Shopkeeper fields for incoming generative-re-rendered items

  1. Changes
    - Adds columns to `wardrobe_items` so items flown in from the Extraction Lab keep
      their provenance and verification state:
      - `color_hex` (text) — dominant color hex code used during re-rendering
      - `parent_model_id` (uuid nullable) — id of the source extraction, if any
      - `status` (text) — one of 'unchecked', 'verified', 'duplicate' (default 'verified' for seed rows)
      - `source` (text) — 'seed' or 'extraction' so the UI can distinguish newly sent items
      - `rendered_at` (timestamptz nullable) — when Dr. Scientist's re-render finished
    - Permissive INSERT policy for anon role so the demo (without auth) can hand items over.
      The Extraction Lab runs client-side and this is a single-user portfolio demo; in a real
      multi-tenant deployment this policy would be authenticated-only.

  2. Security
    - RLS remains enabled on `wardrobe_items`.
    - SELECT stays public, DELETE/UPDATE remain authenticated-only.
    - INSERT policy is scoped to anon ONLY for rows tagged as `source = 'extraction'`, so
      seed data and admin rows cannot be forged anonymously beyond this channel.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wardrobe_items' AND column_name='color_hex') THEN
    ALTER TABLE wardrobe_items ADD COLUMN color_hex text DEFAULT '#999999';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wardrobe_items' AND column_name='parent_model_id') THEN
    ALTER TABLE wardrobe_items ADD COLUMN parent_model_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wardrobe_items' AND column_name='status') THEN
    ALTER TABLE wardrobe_items ADD COLUMN status text DEFAULT 'verified';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wardrobe_items' AND column_name='source') THEN
    ALTER TABLE wardrobe_items ADD COLUMN source text DEFAULT 'seed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wardrobe_items' AND column_name='rendered_at') THEN
    ALTER TABLE wardrobe_items ADD COLUMN rendered_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='wardrobe_items' AND policyname='Anon can insert extraction handover items'
  ) THEN
    CREATE POLICY "Anon can insert extraction handover items"
      ON wardrobe_items FOR INSERT
      TO anon
      WITH CHECK (source = 'extraction' AND status = 'unchecked');
  END IF;
END $$;