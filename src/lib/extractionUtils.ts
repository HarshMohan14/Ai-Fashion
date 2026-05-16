import { type ExtractedItem } from './drScientist';

export type ScoutImportMetadata = {
  scout_source_url?: string;
  scout_source_name?: string;
  scout_query?: string;
  scout_brief?: string;
  scout_license_label?: string;
  scout_confidence?: number;
  scout_collection_key?: string;
  scout_collection_title?: string;
  scout_category_hint?: string;
  scout_subcategory_hint?: string;
};

export type LabItem = ExtractedItem & {
  renderedDataUrl?: string;
  renderStatus?: 'pending' | 'ready' | 'failed';
  renderModel?: string;
  approved?: boolean;
  dispatched?: boolean;
  targetCategory?: string;
  targetSubcategory?: string;
  scoutMetadata?: ScoutImportMetadata;
};

export const CATEGORY_MAP: Array<{ match: RegExp; category: string; sub: string }> = [
  // Topwear
  { match: /t-?shirt|tee\b/i, category: 'Topwear', sub: 'T-Shirts' },
  { match: /polo/i, category: 'Topwear', sub: 'Polos' },
  { match: /formal shirt|dress shirt/i, category: 'Topwear', sub: 'Formal Shirts' },
  { match: /sweatshirt/i, category: 'Topwear', sub: 'Sweatshirts' },
  { match: /hoodie/i, category: 'Topwear', sub: 'Hoodies' },
  { match: /sweater|jumper|pullover/i, category: 'Topwear', sub: 'Sweaters' },
  { match: /tank top|camisole/i, category: 'Topwear', sub: 'Tank Tops' },
  { match: /shirt/i, category: 'Topwear', sub: 'Casual Shirts' },

  // Bottomwear
  { match: /jean|denim/i, category: 'Bottomwear', sub: 'Jeans' },
  { match: /chino/i, category: 'Bottomwear', sub: 'Chinos' },
  { match: /cargo/i, category: 'Bottomwear', sub: 'Cargo Pants' },
  { match: /formal trouser|dress pant/i, category: 'Bottomwear', sub: 'Formal Trousers' },
  { match: /skirt/i, category: 'Bottomwear', sub: 'Skirts' },
  { match: /legging|yoga pant/i, category: 'Bottomwear', sub: 'Leggings' },
  { match: /jogger|track ?pant|sweatpant/i, category: 'Bottomwear', sub: 'Joggers' },
  { match: /short/i, category: 'Bottomwear', sub: 'Shorts' },
  { match: /trouser|pant|bottom/i, category: 'Bottomwear', sub: 'Casual Trousers' },

  // Outerwear
  { match: /blazer|suit jacket/i, category: 'Outerwear', sub: 'Blazers' },
  { match: /trench/i, category: 'Outerwear', sub: 'Trench Coats' },
  { match: /puffer/i, category: 'Outerwear', sub: 'Puffer Jackets' },
  { match: /coat|overcoat/i, category: 'Outerwear', sub: 'Coats' },
  { match: /cardigan/i, category: 'Outerwear', sub: 'Cardigans' },
  { match: /vest|waistcoat/i, category: 'Outerwear', sub: 'Vests' },
  { match: /jacket|bomber/i, category: 'Outerwear', sub: 'Jackets' },

  // Activewear
  { match: /tracksuit/i, category: 'Activewear', sub: 'Tracksuits' },
  { match: /sports bra/i, category: 'Activewear', sub: 'Sports Bras' },
  { match: /gym short/i, category: 'Activewear', sub: 'Gym Shorts' },

  // Footwear
  { match: /sneaker|trainer|kick/i, category: 'Footwear', sub: 'Sneakers' },
  { match: /loafer/i, category: 'Footwear', sub: 'Loafers' },
  { match: /formal shoe|oxford|derby/i, category: 'Footwear', sub: 'Formal Shoes' },
  { match: /sandal|slipper|flip flop/i, category: 'Footwear', sub: 'Sandals' },
  { match: /boot/i, category: 'Footwear', sub: 'Boots' },
  { match: /heel|pump/i, category: 'Footwear', sub: 'Heels' },
  { match: /flat|ballet/i, category: 'Footwear', sub: 'Flats' },
  { match: /shoe|footwear/i, category: 'Footwear', sub: 'Casual Shoes' },

  // Eyewear
  { match: /sunglass|shade/i, category: 'Eyewear', sub: 'Sunglasses' },
  { match: /glass|eyewear|spectacle/i, category: 'Eyewear', sub: 'Reading Glasses' },

  // Jewelry
  { match: /necklace|pendant|chain|choker/i, category: 'Jewelry', sub: 'Necklaces' },
  { match: /ring/i, category: 'Jewelry', sub: 'Rings' },
  { match: /bracelet|bangle/i, category: 'Jewelry', sub: 'Bracelets' },
  { match: /earring/i, category: 'Jewelry', sub: 'Earrings' },

  // Bags
  { match: /backpack|rucksack/i, category: 'Bags', sub: 'Backpacks' },
  { match: /handbag|purse/i, category: 'Bags', sub: 'Handbags' },
  { match: /tote/i, category: 'Bags', sub: 'Tote Bags' },
  { match: /messenger|sling/i, category: 'Bags', sub: 'Messenger Bags' },
  { match: /duffle|luggage/i, category: 'Bags', sub: 'Duffles' },
  { match: /bag/i, category: 'Bags', sub: 'Tote Bags' },

  // Headwear
  { match: /cap|baseball cap/i, category: 'Headwear', sub: 'Caps' },
  { match: /hat|fedora|panama/i, category: 'Headwear', sub: 'Hats' },
  { match: /beanie|tuque/i, category: 'Headwear', sub: 'Beanies' },

  // Accessories
  { match: /watch/i, category: 'Accessories', sub: 'Watches' },
  { match: /belt/i, category: 'Accessories', sub: 'Belts' },
  { match: /fragrance|perfume|cologne/i, category: 'Accessories', sub: 'Fragrances' },
  { match: /scarf|muffler/i, category: 'Accessories', sub: 'Scarves' },
  { match: /tie|necktie/i, category: 'Accessories', sub: 'Ties' },
  { match: /glove/i, category: 'Accessories', sub: 'Gloves' },
  { match: /headphone|earphone|earbud/i, category: 'Accessories', sub: 'Headphones' },

  // Indian Wear
  { match: /saree|sari/i, category: 'Indian Wear', sub: 'Sarees' },
  { match: /lehenga/i, category: 'Indian Wear', sub: 'Lehengas' },
  { match: /sherwani/i, category: 'Indian Wear', sub: 'Sherwanis' },
  { match: /nehru/i, category: 'Indian Wear', sub: 'Nehru Jackets' },
  { match: /dhoti/i, category: 'Indian Wear', sub: 'Dhotis' },
  { match: /salwar|churidar/i, category: 'Indian Wear', sub: 'Salwar Suits' },
  { match: /kurta|kurti/i, category: 'Indian Wear', sub: 'Kurtas' },
];

export function classifyItem(name: string, category: string): { category: string; subcategory: string } {
  const hay = `${name} ${category}`;
  for (const rule of CATEGORY_MAP) {
    if (rule.match.test(hay)) return { category: rule.category, subcategory: rule.sub };
  }
  return { category: 'Topwear', subcategory: 'T-Shirts' };
}