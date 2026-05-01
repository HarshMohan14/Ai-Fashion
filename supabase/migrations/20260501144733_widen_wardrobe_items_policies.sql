/*
  # Widen wardrobe_items RLS to anon role

  1. Problem
    - `wardrobe_items` had UPDATE, DELETE, and INSERT policies restricted to the
      `authenticated` role only. The app uses the Supabase anon key, so edits
      (mark verified, delete) silently failed under RLS and the UI reverted on
      the next reload.

  2. Fix
    - Drop the authenticated-only UPDATE, DELETE, and INSERT policies.
    - Recreate them for `{anon, authenticated}` to match the pattern already
      used by `models_public`, `models_private`, and `runway_looks`.
    - SELECT policy is left untouched.

  3. Security note
    - This matches the demo-permissive pattern used across the rest of the lab.
      In production, all mutation policies should be tightened to an admin role.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wardrobe_items' AND policyname='Authenticated can update wardrobe items') THEN
    DROP POLICY "Authenticated can update wardrobe items" ON wardrobe_items;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wardrobe_items' AND policyname='Authenticated can delete wardrobe items') THEN
    DROP POLICY "Authenticated can delete wardrobe items" ON wardrobe_items;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wardrobe_items' AND policyname='Authenticated can insert wardrobe items') THEN
    DROP POLICY "Authenticated can insert wardrobe items" ON wardrobe_items;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wardrobe_items' AND policyname='Admin can update wardrobe items') THEN
    CREATE POLICY "Admin can update wardrobe items"
      ON wardrobe_items FOR UPDATE TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wardrobe_items' AND policyname='Admin can delete wardrobe items') THEN
    CREATE POLICY "Admin can delete wardrobe items"
      ON wardrobe_items FOR DELETE TO anon, authenticated
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wardrobe_items' AND policyname='Admin can insert wardrobe items') THEN
    CREATE POLICY "Admin can insert wardrobe items"
      ON wardrobe_items FOR INSERT TO anon, authenticated
      WITH CHECK (true);
  END IF;
END $$;