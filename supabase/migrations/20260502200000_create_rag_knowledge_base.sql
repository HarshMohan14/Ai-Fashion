/*
  # RAG knowledge base for model consistency

  Stores one active generated reference photo per model and structured Runway
  feedback across Face, Body, Style, Hair, and Complexion.
*/

CREATE TABLE IF NOT EXISTS rag_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES models_public(id) ON DELETE CASCADE,
  look_id uuid REFERENCES runway_looks(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('reference', 'feedback')),
  image_url text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  face_score integer CHECK (face_score IS NULL OR face_score BETWEEN 1 AND 5),
  face_note text NOT NULL DEFAULT '',
  body_score integer CHECK (body_score IS NULL OR body_score BETWEEN 1 AND 5),
  body_note text NOT NULL DEFAULT '',
  style_score integer CHECK (style_score IS NULL OR style_score BETWEEN 1 AND 5),
  style_note text NOT NULL DEFAULT '',
  hair_score integer CHECK (hair_score IS NULL OR hair_score BETWEEN 1 AND 5),
  hair_note text NOT NULL DEFAULT '',
  complexion_score integer CHECK (complexion_score IS NULL OR complexion_score BETWEEN 1 AND 5),
  complexion_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    entry_type = 'reference'
    OR (
      face_score BETWEEN 1 AND 5
      AND body_score BETWEEN 1 AND 5
      AND style_score BETWEEN 1 AND 5
      AND hair_score BETWEEN 1 AND 5
      AND complexion_score BETWEEN 1 AND 5
    )
  )
);

ALTER TABLE rag_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rag_knowledge_base_model_created
  ON rag_knowledge_base(model_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_knowledge_base_one_active_reference
  ON rag_knowledge_base(model_id)
  WHERE entry_type = 'reference' AND is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='rag_knowledge_base'
      AND policyname='Anyone can view rag knowledge base'
  ) THEN
    CREATE POLICY "Anyone can view rag knowledge base"
      ON rag_knowledge_base FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='rag_knowledge_base'
      AND policyname='Admin can insert rag knowledge base'
  ) THEN
    CREATE POLICY "Admin can insert rag knowledge base"
      ON rag_knowledge_base FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='rag_knowledge_base'
      AND policyname='Admin can update rag knowledge base'
  ) THEN
    CREATE POLICY "Admin can update rag knowledge base"
      ON rag_knowledge_base FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='rag_knowledge_base'
      AND policyname='Admin can delete rag knowledge base'
  ) THEN
    CREATE POLICY "Admin can delete rag knowledge base"
      ON rag_knowledge_base FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;
