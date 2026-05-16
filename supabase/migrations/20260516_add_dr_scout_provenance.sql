-- Dr. Scout provenance for web/manual sourced wardrobe references.
ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS scout_source_url text,
  ADD COLUMN IF NOT EXISTS scout_source_name text,
  ADD COLUMN IF NOT EXISTS scout_query text,
  ADD COLUMN IF NOT EXISTS scout_brief text,
  ADD COLUMN IF NOT EXISTS scout_license_label text,
  ADD COLUMN IF NOT EXISTS scout_confidence integer CHECK (scout_confidence IS NULL OR (scout_confidence >= 0 AND scout_confidence <= 100)),
  ADD COLUMN IF NOT EXISTS scout_collection_key text,
  ADD COLUMN IF NOT EXISTS scout_collection_title text,
  ADD COLUMN IF NOT EXISTS scout_imported_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_wardrobe_items_scout_collection
  ON public.wardrobe_items(scout_collection_key)
  WHERE scout_collection_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wardrobe_items_source
  ON public.wardrobe_items(source);

DROP POLICY IF EXISTS "Anon can insert extraction handover items" ON public.wardrobe_items;
CREATE POLICY "Anon can insert extraction handover items"
  ON public.wardrobe_items FOR INSERT
  TO anon
  WITH CHECK (source IN ('extraction', 'dr_scout') AND status = 'unchecked');
