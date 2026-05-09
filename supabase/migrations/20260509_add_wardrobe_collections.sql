-- Add collection column to wardrobe_items
ALTER TABLE public.wardrobe_items 
ADD COLUMN collection text DEFAULT 'regular' NOT NULL;

-- Update existing items just to be safe
UPDATE public.wardrobe_items 
SET collection = 'regular' 
WHERE collection IS NULL;
