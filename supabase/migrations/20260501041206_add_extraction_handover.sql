/*
  # Add handover flag to extractions

  1. Changes
    - Add `handed_over` boolean to `extractions` tracking if the run has been filed into the wardrobe
  2. Security
    - No policy changes needed; existing RLS still applies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extractions' AND column_name = 'handed_over'
  ) THEN
    ALTER TABLE extractions ADD COLUMN handed_over boolean DEFAULT false;
  END IF;
END $$;