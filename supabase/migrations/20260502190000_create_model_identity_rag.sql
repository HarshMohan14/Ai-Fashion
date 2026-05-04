/*
  # Model identity RAG lessons

  Stores reusable model-accuracy critique notes from Runway feedback and Gemini's
  identity critic. These lessons are loaded before future generations for the
  same model.
*/

CREATE TABLE IF NOT EXISTS model_identity_rag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES models_public(id) ON DELETE CASCADE,
  look_id uuid REFERENCES runway_looks(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('manual_runway', 'ai_identity_critic')),
  lesson text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_identity_rag ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_model_identity_rag_model_created
  ON model_identity_rag(model_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='model_identity_rag'
      AND policyname='Anyone can view model identity rag'
  ) THEN
    CREATE POLICY "Anyone can view model identity rag"
      ON model_identity_rag FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='model_identity_rag'
      AND policyname='Admin can insert model identity rag'
  ) THEN
    CREATE POLICY "Admin can insert model identity rag"
      ON model_identity_rag FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='model_identity_rag'
      AND policyname='Admin can update model identity rag'
  ) THEN
    CREATE POLICY "Admin can update model identity rag"
      ON model_identity_rag FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='model_identity_rag'
      AND policyname='Admin can delete model identity rag'
  ) THEN
    CREATE POLICY "Admin can delete model identity rag"
      ON model_identity_rag FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;
