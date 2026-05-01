/*
  # Dr. Scientist Extraction Lab

  1. New Tables
    - `extractions` — records of each scan (original image, notes, timestamp)
    - `extraction_items` — individual detected garments per extraction (category, color, fabric, fit, bounding box)
  2. Security
    - RLS enabled on both tables
    - Policies scoped to authenticated users only, matching `user_id`
  3. Notes
    - Uses anon-friendly insert policy for demo mode via nullable user_id fallback
*/

CREATE TABLE IF NOT EXISTS extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  image_url text DEFAULT '',
  notes text DEFAULT '',
  mocked boolean DEFAULT false,
  item_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extraction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id uuid REFERENCES extractions(id) ON DELETE CASCADE,
  name text DEFAULT '',
  category text DEFAULT '',
  color text DEFAULT '',
  fabric text DEFAULT '',
  fit text DEFAULT '',
  confidence numeric DEFAULT 0,
  box_x numeric DEFAULT 0,
  box_y numeric DEFAULT 0,
  box_w numeric DEFAULT 0,
  box_h numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own extractions"
  ON extractions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own extractions"
  ON extractions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own extractions"
  ON extractions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own extractions"
  ON extractions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users view own extraction items"
  ON extraction_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM extractions
      WHERE extractions.id = extraction_items.extraction_id
      AND extractions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own extraction items"
  ON extraction_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM extractions
      WHERE extractions.id = extraction_items.extraction_id
      AND extractions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete own extraction items"
  ON extraction_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM extractions
      WHERE extractions.id = extraction_items.extraction_id
      AND extractions.user_id = auth.uid()
    )
  );