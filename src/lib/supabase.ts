import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string;

export const supabase = createClient(url, publishableKey);

export type WardrobeItem = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  image_url: string;
  fabric: string;
  fit: string;
  success_rate: number;
  popularity: number;
  created_at: string;
  color_hex?: string | null;
  parent_model_id?: string | null;
  status?: 'verified' | 'unchecked' | 'duplicate' | string | null;
  source?: 'seed' | 'extraction' | string | null;
  rendered_at?: string | null;
};
