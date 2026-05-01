/*
  # The Fashion Lab - Digital Wardrobe Schema

  1. New Tables
    - `wardrobe_items`
      - `id` (uuid, primary key)
      - `name` (text) - item display name
      - `category` (text) - one of Topwear, Bottomwear, Footwear, Accessories, Indian Wear
      - `subcategory` (text) - e.g. T-Shirts, Jeans, Kurtas
      - `image_url` (text) - hosted image url
      - `fabric` (text) - Dr. Shopkeeper tag
      - `fit` (text) - Dr. Shopkeeper tag
      - `success_rate` (int) - 0-100 Date rating percentage
      - `popularity` (int) - sort weight
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on wardrobe_items
    - Public read access (this is a catalog)
    - Authenticated users can insert/update/delete (admin dashboard)
*/

CREATE TABLE IF NOT EXISTS wardrobe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  subcategory text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  fabric text NOT NULL DEFAULT 'Cotton',
  fit text NOT NULL DEFAULT 'Regular',
  success_rate int NOT NULL DEFAULT 0,
  popularity int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view wardrobe items"
  ON wardrobe_items FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated can insert wardrobe items"
  ON wardrobe_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update wardrobe items"
  ON wardrobe_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete wardrobe items"
  ON wardrobe_items FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_wardrobe_category ON wardrobe_items(category);
CREATE INDEX IF NOT EXISTS idx_wardrobe_subcategory ON wardrobe_items(subcategory);
