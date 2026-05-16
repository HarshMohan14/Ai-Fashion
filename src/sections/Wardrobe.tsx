import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Filter, Search, Shirt, Footprints, Watch, Sparkles, User, BadgeCheck, Inbox, Trash2, Layers, Activity, Briefcase, Glasses, Gem, Crown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase, WardrobeItem } from '../lib/supabase';
import { useDirector } from '../context/DirectorContext';

const CATEGORIES: { name: string; icon: LucideIcon; subs: string[] }[] = [
  { name: 'Topwear', icon: Shirt, subs: ['T-Shirts', 'Casual Shirts', 'Formal Shirts', 'Sweatshirts', 'Hoodies', 'Sweaters', 'Polos', 'Tank Tops'] },
  { name: 'Bottomwear', icon: User, subs: ['Jeans', 'Chinos', 'Casual Trousers', 'Formal Trousers', 'Joggers', 'Shorts', 'Cargo Pants', 'Skirts', 'Leggings'] },
  { name: 'Outerwear', icon: Layers, subs: ['Jackets', 'Blazers', 'Coats', 'Cardigans', 'Trench Coats', 'Puffer Jackets', 'Vests'] },
  { name: 'Activewear', icon: Activity, subs: ['Tracksuits', 'Sports Bras', 'Gym Shorts', 'Athletic Leggings'] },
  { name: 'Footwear', icon: Footprints, subs: ['Casual Shoes', 'Sneakers', 'Formal Shoes', 'Loafers', 'Sandals', 'Boots', 'Heels', 'Flats'] },
  { name: 'Accessories', icon: Watch, subs: ['Watches', 'Belts', 'Fragrances', 'Scarves', 'Ties', 'Gloves', 'Headphones'] },
  { name: 'Eyewear', icon: Glasses, subs: ['Sunglasses', 'Reading Glasses'] },
  { name: 'Jewelry', icon: Gem, subs: ['Necklaces', 'Rings', 'Bracelets', 'Earrings'] },
  { name: 'Bags', icon: Briefcase, subs: ['Backpacks', 'Handbags', 'Tote Bags', 'Messenger Bags', 'Duffles'] },
  { name: 'Headwear', icon: Crown, subs: ['Caps', 'Hats', 'Beanies'] },
  { name: 'Indian Wear', icon: Sparkles, subs: ['Kurtas', 'Nehru Jackets', 'Sherwanis', 'Sarees', 'Lehengas', 'Dhotis', 'Salwar Suits'] },
];

type Sort = 'popularity' | 'newest' | 'rating';

export function Wardrobe() {
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [collectionTab, setCollectionTab] = useState<'regular' | 'comicon' | 'scout'>('regular');
  const [category, setCategory] = useState<string>('Topwear');
  const [subcategory, setSubcategory] = useState<string>('All');
  const [sort, setSort] = useState<Sort>('popularity');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const director = useDirector();

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('wardrobe_items')
        .select('*')
        .order('created_at', { ascending: false });
      if (mounted) {
        setItems(data ?? []);
        setLoading(false);
      }
    })();

    const channel = supabase
      .channel('wardrobe_items_live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wardrobe_items' },
        (payload) => {
          const row = payload.new as WardrobeItem;
          setItems((list) => (list.some((i) => i.id === row.id) ? list : [row, ...list]));
          if (row.status === 'unchecked') {
            setCategory(row.category);
            setSubcategory(row.subcategory);
            setFlashId(row.id);
            window.setTimeout(() => setFlashId(null), 2600);
          }
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const uncheckedCount = useMemo(
    () => items.filter((i) => i.status === 'unchecked').length,
    [items],
  );

  const currentCat = CATEGORIES.find((c) => c.name === category)!;

  const filtered = useMemo(() => {
    let list = items.filter((i) => {
      if (collectionTab === 'scout') return i.source === 'dr_scout' || Boolean(i.scout_collection_key);
      return (i.collection || 'regular') === collectionTab;
    });
    list = list.filter((i) => i.category === category);
    if (subcategory !== 'All') list = list.filter((i) => i.subcategory === subcategory);
    if (query) list = list.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
    if (onlyUnchecked) list = list.filter((i) => i.status === 'unchecked');
    if (onlyVerified) list = list.filter((i) => i.status === 'verified');
    if (sort === 'popularity') list = [...list].sort((a, b) => b.popularity - a.popularity);
    if (sort === 'rating') list = [...list].sort((a, b) => b.success_rate - a.success_rate);
    if (sort === 'newest') list = [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return list;
  }, [items, collectionTab, category, subcategory, sort, query, onlyUnchecked, onlyVerified]);

  const markVerified = async (id: string) => {
    const snapshot = items;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, status: 'verified' } : i)));
    const { data, error } = await supabase
      .from('wardrobe_items')
      .update({ status: 'verified' })
      .eq('id', id)
      .select('id');
    if (error || !data || data.length === 0) {
      setItems(snapshot);
      director.push(
        'Dr. Shopkeeper',
        error?.message || 'Could not mark this item verified — the database rejected the change.',
      );
    }
  };

  
  const moveToCollection = async (id: string, targetCollection: 'regular' | 'comicon') => {
    const snapshot = items;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, collection: targetCollection } : i)));
    const { data, error } = await supabase
      .from('wardrobe_items')
      .update({ collection: targetCollection })
      .eq('id', id)
      .select('id');
    if (error || !data || data.length === 0) {
      setItems(snapshot);
      director.push('Dr. Shopkeeper', error?.message || 'Could not move this item.');
    }
  };

  const removeItem = async (id: string) => {
    const snapshot = items;
    setItems((list) => list.filter((i) => i.id !== id));
    const { data, error } = await supabase
      .from('wardrobe_items')
      .delete()
      .eq('id', id)
      .select('id');
    if (error || !data || data.length === 0) {
      setItems(snapshot);
      director.push(
        'Dr. Shopkeeper',
        error?.message || 'Delete was rejected by the database — the item is still on the rail.',
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
                <div>
          <div className="eyebrow">Section 02 · Dr. Shopkeeper</div>
          <h1 className="section-title mt-2">Digital Wardrobe</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1.5 max-w-xl">
            A curated atelier of every garment extracted into the lab.
          </p>
          <div className="flex bg-black/5 dark:bg-white/5 p-1 rounded-xl mt-4 w-max">
            <button
              onClick={() => setCollectionTab('regular')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${collectionTab === 'regular' ? 'bg-white dark:bg-[#222] shadow text-cobalt dark:text-indigo_electric' : 'text-neutral-500'}`}
            >
              Regular Collection
            </button>
            <button
              onClick={() => setCollectionTab('comicon')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${collectionTab === 'comicon' ? 'bg-white dark:bg-[#222] shadow text-purple-600' : 'text-neutral-500'}`}
            >
              Comicon Collection
            </button>
            <button
              onClick={() => setCollectionTab('scout')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${collectionTab === 'scout' ? 'bg-white dark:bg-[#222] shadow text-emerald-600' : 'text-neutral-500'}`}
            >
              Scout Drops
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setOnlyUnchecked((v) => !v); setOnlyVerified(false); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm transition ${
              onlyUnchecked
                ? 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'border-lab-border-light dark:border-lab-border bg-white/50 dark:bg-white/[0.03]'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            Unchecked
            {uncheckedCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] grid place-items-center font-semibold">
                {uncheckedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setOnlyVerified((v) => !v); setOnlyUnchecked(false); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm transition ${
              onlyVerified
                ? 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'border-lab-border-light dark:border-lab-border bg-white/50 dark:bg-white/[0.03]'
            }`}
          >
            <BadgeCheck className="w-3.5 h-3.5" />
            Verified
          </button>
          <div className="flex items-center gap-2 px-3 py-2 rounded-full border border-lab-border-light dark:border-lab-border bg-white/50 dark:bg-white/[0.03]">
            <Search className="w-3.5 h-3.5 text-neutral-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rail…"
              className="bg-transparent outline-none text-sm w-40"
            />
          </div>
          <SortDropdown sort={sort} onChange={setSort} />
        </div>
      </div>

      {/* Category top-bar */}
      <div className="bento p-2 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = c.name === category;
            return (
              <button
                key={c.name}
                onClick={() => { setCategory(c.name); setSubcategory('All'); }}
                className="relative px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"
              >
                {active && (
                  <motion.div
                    layoutId="cat-pill"
                    transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                    className="absolute inset-0 rounded-xl bg-black text-white dark:bg-white dark:text-black"
                  />
                )}
                <Icon className={`w-4 h-4 relative z-10 ${active ? 'text-white dark:text-black' : 'text-neutral-500'}`} />
                <span className={`relative z-10 font-medium ${active ? 'text-white dark:text-black' : ''}`}>{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-category chips */}
      <div className="flex gap-2 flex-wrap">
        <SubChip label="All" active={subcategory === 'All'} onClick={() => setSubcategory('All')} />
        {currentCat.subs.map((s) => (
          <SubChip key={s} label={s} active={subcategory === s} onClick={() => setSubcategory(s)} />
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bento aspect-[3/4] animate-pulse bg-black/5 dark:bg-white/5" />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`${category}-${subcategory}-${sort}`}
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5"
          >
            {filtered.map((item, i) => (
              <Card
                key={item.id}
                item={item}
                delay={i * 0.03}
                flash={flashId === item.id}
                onVerify={() => markVerified(item.id)}
                onDelete={() => {
                  if (confirm(`Delete ${item.name}? Dr. Stylist will stop using this item.`)) {
                    removeItem(item.id);
                  }
                }}
                onMoveToCollection={() => moveToCollection(item.id, (item.collection || 'regular') === 'regular' ? 'comicon' : 'regular')}
              />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full bento text-center text-sm text-neutral-500">
                No items in this drawer — try another filter.
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function SubChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition
        ${active
          ? 'bg-cobalt dark:bg-indigo_electric text-white border-transparent'
          : 'border-lab-border-light dark:border-lab-border text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5'}`}
    >
      {label}
    </button>
  );
}

function SortDropdown({ sort, onChange }: { sort: Sort; onChange: (s: Sort) => void }) {
  const [open, setOpen] = useState(false);
  const labels: Record<Sort, string> = {
    popularity: 'Most Popular',
    newest: 'Newest',
    rating: 'High Rated',
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-full border border-lab-border-light dark:border-lab-border bg-white/50 dark:bg-white/[0.03] text-sm"
      >
        <Filter className="w-3.5 h-3.5" />
        Sort: {labels[sort]}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 mt-2 w-44 rounded-xl border border-lab-border-light dark:border-lab-border bg-white dark:bg-[#111] p-1 z-20 shadow-boutique"
          >
            {(['popularity', 'rating', 'newest'] as Sort[]).map((s) => (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-black/5 dark:hover:bg-white/5 ${
                  sort === s ? 'text-cobalt dark:text-indigo_electric font-medium' : ''
                }`}
              >
                {labels[s]}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Card({
  item,
  delay,
  flash,
  onVerify,
  onDelete,
  onMoveToCollection,
}: {
  item: WardrobeItem;
  delay: number;
  flash: boolean;
  onVerify: () => void;
  onDelete: () => void;
  onMoveToCollection: () => void;
}) {
  const badgeColor =
    item.success_rate >= 90 ? 'bg-emerald-500' :
    item.success_rate >= 80 ? 'bg-cobalt dark:bg-indigo_electric' :
    item.success_rate >= 70 ? 'bg-amber-500' : 'bg-neutral-400';

  const isUnchecked = item.status === 'unchecked';
  const imageUrl = item.image_url?.trim();
  const [imageFailed, setImageFailed] = useState(!imageUrl);

  useEffect(() => {
    setImageFailed(!imageUrl);
  }, [imageUrl]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{
        opacity: 1,
        y: 0,
        boxShadow: flash
          ? [
              '0 0 0 0 rgba(16,185,129,0)',
              '0 0 0 6px rgba(16,185,129,0.35)',
              '0 0 0 0 rgba(16,185,129,0)',
            ]
          : '0 0 0 0 rgba(16,185,129,0)',
      }}
      transition={{ type: 'spring', stiffness: 100, damping: 18, delay, boxShadow: { duration: 1.8 } }}
      whileHover={{ y: -4 }}
      className={`group bento p-3 overflow-hidden relative ${
        isUnchecked ? 'border-amber-400/50 dark:border-amber-300/30' : ''
      }`}
    >
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-white">
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-100 via-white to-neutral-200 dark:from-neutral-800 dark:via-neutral-900 dark:to-neutral-700" />
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt={item.name}
            className={`relative w-full h-full transition duration-700 group-hover:scale-105 ${
              item.source === 'extraction' ? 'object-contain p-4' : 'object-cover'
            }`}
            loading="lazy"
            decoding="async"
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="relative grid h-full w-full place-items-center p-6 text-center text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
            Image unavailable
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
          {isUnchecked ? (
            <span className="text-[10px] uppercase tracking-wider font-semibold text-white px-2 py-1 rounded-full bg-amber-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Unchecked
            </span>
          ) : (
            <span className={`text-[10px] uppercase tracking-wider font-semibold text-white px-2 py-1 rounded-full ${badgeColor}`}>
              {item.success_rate}% Date
            </span>
          )}
          {item.source === 'extraction' && (
            <span className="text-[10px] uppercase tracking-wider font-semibold text-white px-2 py-1 rounded-full bg-black/70">
              Re-rendered
            </span>
          )}
          {item.source === 'dr_scout' && (
            <span className="text-[10px] uppercase tracking-wider font-semibold text-white px-2 py-1 rounded-full bg-emerald-600">
              Dr. Scout
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full grid place-items-center bg-black/40 backdrop-blur text-white opacity-0 group-hover:opacity-100 transition hover:bg-rose-500 hover:scale-105"
          aria-label="Delete item"
          title="Archive this item"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveToCollection(); }}
          className="absolute bottom-3 right-3 w-8 h-8 rounded-full grid place-items-center bg-black/40 backdrop-blur text-white opacity-0 group-hover:opacity-100 transition hover:bg-emerald-500 hover:scale-105"
          aria-label="Move collection"
          title="Move between Regular/Comicon"
        >
          <Briefcase className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{item.name}</div>
            <div className="text-[11px] text-neutral-500 uppercase tracking-wider mt-0.5">{item.subcategory}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="chip">Fabric · {item.fabric}</span>
          <span className="chip">Fit · {item.fit}</span>
          {item.scout_collection_title && <span className="chip">Scout · {item.scout_collection_title}</span>}
          {item.color_hex && (
            <span className="chip">
              <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ background: item.color_hex }} />
              {item.color_hex}
            </span>
          )}
        </div>
        {isUnchecked && (
          <button
            onClick={onVerify}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium transition"
          >
            <BadgeCheck className="w-3.5 h-3.5" /> Mark verified
          </button>
        )}
      </div>
    </motion.div>
  );
}
