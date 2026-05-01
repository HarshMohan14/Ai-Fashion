/*
  # Composite contact-sheet intake for Dr. Body

  1. Changes to `models_public`
    - `composite_url` (text) — URL / data-URL of the original 5-up contact sheet
    - `crop_coordinates` (jsonb) — normalized boxes for front/back/left/right/face,
      e.g. { front:{x,y,width,height}, face:{...}, ... } so Dr. Stylist and
      Dr. Photographer can pull any single angle without reloading the sheet.
    - `facial_metadata` (jsonb) — Dr. Body's facial tags (jawline, grooming, skin_tone,
      complexion, features, hair) used downstream for lighting & color coordination.
    - `joint_map` (jsonb) — skeleton landmark overlay on the front view
      { shoulders:{left,right}, hips:{left,right}, knees:{left,right}, neck, waist }
      each point normalized to the front-view bounding box.
    - `shoulder_to_waist_ratio` (numeric) — shortcut for frequent Dr. Stylist joins.

  2. Security
    - No policy changes. Existing RLS on `models_public` applies.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='models_public' AND column_name='composite_url') THEN
    ALTER TABLE models_public ADD COLUMN composite_url text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='models_public' AND column_name='crop_coordinates') THEN
    ALTER TABLE models_public ADD COLUMN crop_coordinates jsonb DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='models_public' AND column_name='facial_metadata') THEN
    ALTER TABLE models_public ADD COLUMN facial_metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='models_public' AND column_name='joint_map') THEN
    ALTER TABLE models_public ADD COLUMN joint_map jsonb DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='models_public' AND column_name='shoulder_to_waist_ratio') THEN
    ALTER TABLE models_public ADD COLUMN shoulder_to_waist_ratio numeric DEFAULT 0;
  END IF;
END $$;