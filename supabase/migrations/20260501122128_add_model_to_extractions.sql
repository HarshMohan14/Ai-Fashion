/*
  # Record which Gemini model answered each extraction

  1. Changes
    - Adds `model` text column to `extractions` so every scan records the Gemini model
      that actually produced results (e.g. "gemini-2.5-flash").
  2. Security
    - No policy changes needed; existing RLS on `extractions` applies.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extractions' AND column_name = 'model'
  ) THEN
    ALTER TABLE extractions ADD COLUMN model text;
  END IF;
END $$;