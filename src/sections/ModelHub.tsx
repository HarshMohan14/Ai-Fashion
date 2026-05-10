import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Upload, X, Users, Check, Loader2, Trash2, FileImage, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useDirector } from '../context/DirectorContext';

const MODEL_PHOTOSHEET_BUCKET = 'model-photosheets';

type ModelPublic = {
  id: string;
  nickname: string;
  primary_photo_url: string;
  composite_url: string;
  photos: {
    front?: string;
    side?: string;
    back?: string;
    closeup?: string;
    composite?: string;
    left?: string;
    right?: string;
  };
  physical_description?: string;
  created_at: string;
};

export function ModelHub() {
  const [models, setModels] = useState<ModelPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('models_public')
      .select('id, nickname, primary_photo_url, composite_url, photos, physical_description, created_at')
      .order('created_at', { ascending: false });
    setModels((data ?? []) as ModelPublic[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow">Section 04 · Dr. Body</div>
          <h1 className="section-title mt-2">Model Hub</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1.5 max-w-xl">
            A clean visual roster of every model. One nickname, one composite stylesheet — that's the entire identity.
          </p>
        </div>
        <button onClick={() => setShowDrawer(true)} className="btn-primary">
          <Plus className="w-3.5 h-3.5" /> Add new model
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bento aspect-[3/4] animate-pulse bg-black/5 dark:bg-white/5" />
          ))}
        </div>
      ) : models.length === 0 ? (
        <div className="bento grid place-items-center py-20 text-center">
          <Users className="w-10 h-10 text-neutral-400 mb-3" />
          <div className="font-display text-2xl">No models yet</div>
          <div className="text-sm text-neutral-500 mt-1.5 max-w-md">
            Upload a composite stylesheet to add your first physical anchor.
          </div>
          <button onClick={() => setShowDrawer(true)} className="btn-primary mt-5">
            <Plus className="w-3.5 h-3.5" /> Add first model
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
          {models.map((m, i) => (
            <ProfileCard
              key={m.id}
              model={m}
              index={i}
              onRemove={async () => {
                if (!confirm(`Delete ${m.nickname}?`)) return;
                await supabase.from('models_public').delete().eq('id', m.id);
                await load();
              }}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showDrawer && (
          <AddModelDrawer
            onClose={() => setShowDrawer(false)}
            onSaved={async () => { setShowDrawer(false); await load(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfileCard({
  model,
  index,
  onRemove,
}: {
  model: ModelPublic;
  index: number;
  onRemove: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 100, damping: 18, delay: index * 0.04 }}
      whileHover={{ y: -4 }}
      className="bento p-3 relative group"
    >
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-black/5 dark:bg-white/5">
        <img
          src={model.composite_url || model.primary_photo_url}
          alt={model.nickname}
          className="w-full h-full object-cover transition duration-700 group-hover:scale-105"
          loading="lazy"
        />
        <button
          onClick={onRemove}
          className="absolute top-3 right-3 w-8 h-8 rounded-full grid place-items-center bg-black/40 backdrop-blur text-white opacity-0 group-hover:opacity-100 transition hover:bg-rose-500"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2 pt-3 flex items-center justify-between">
        <div className="font-medium truncate">{model.nickname}</div>
        <code className="text-[10px] text-neutral-500 tabular-nums">#{model.id.slice(0, 6)}</code>
      </div>
    </motion.div>
  );
}

function AddModelDrawer({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [files, setFiles] = useState<{ front: File | null; side: File | null; back: File | null; closeup: File | null; left: File | null; right: File | null }>({ front: null, side: null, back: null, closeup: null, left: null, right: null });
  const [previews, setPreviews] = useState<{ front: string | null; side: string | null; back: string | null; closeup: string | null; left: string | null; right: string | null }>({ front: null, side: null, back: null, closeup: null, left: null, right: null });
  const previewsRef = useRef(previews);
  const [nickname, setNickname] = useState('');
  const [physicalDescription, setPhysicalDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [step, setStep] = useState<'form' | 'saving' | 'done'>('form');
  const [error, setError] = useState<string | null>(null);
  const director = useDirector();

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((url) => { if (url) URL.revokeObjectURL(url); });
    };
  }, []);

  const onPick = (key: keyof typeof files, file: File) => {
    if (!file.type.startsWith('image/')) {
      setError(`Please upload an image file for the ${key} angle.`);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPreviews((current) => {
      const previousUrl = current[key];
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return { ...current, [key]: previewUrl };
    });
    setFiles(f => ({ ...f, [key]: file }));
    setError(null);
  };

  const clearSheet = (key: keyof typeof files) => {
    setFiles(f => ({ ...f, [key]: null }));
    setPreviews((current) => {
      const previousUrl = current[key];
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return { ...current, [key]: null };
    });
  };

  const analyzeBody = async () => {
    const activeFiles = Object.values(files).filter(Boolean) as File[];
    if (activeFiles.length === 0) {
      setError('Upload at least one photo for Dr. Body to analyze.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const key = import.meta.env.VITE_GEMINI_API_KEY;
      if (!key) throw new Error('Missing Gemini API Key for analysis');
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const parts = await Promise.all(activeFiles.map(async (file) => {
        const buffer = await file.arrayBuffer();
        return {
          inlineData: {
            data: btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')),
            mimeType: file.type
          }
        };
      }));

      const prompt = "Analyze these photos of a person. Describe their authentic physical build (e.g. plus-size, athletic, slim, stocky, curvy, broad-shouldered), apparent height/proportions, skin tone, hair, and facial features. Return ONLY a concise, plain-text paragraph that can be used to generate them accurately. Do not guess exact measurements if unsure, just use qualitative descriptors.";

      const result = await model.generateContent([prompt, ...parts]);
      const text = result.response.text();
      setPhysicalDescription(text.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const save = async () => {
    if (!nickname.trim() || (!files.front && !files.closeup && !files.side && !files.back)) {
      setError('Please provide a nickname and at least one model photo (front or closeup recommended).');
      return;
    }
    setStep('saving');
    const modelId = crypto.randomUUID();
    
    try {
      const uploadedUrls: Record<string, string> = {};
      
      for (const [key, file] of Object.entries(files)) {
        if (!file) continue;
        const ext = fileExtensionFor(file);
        const objectPath = `models/${modelId}/${key}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from(MODEL_PHOTOSHEET_BUCKET)
          .upload(objectPath, file, { contentType: file.type || 'application/octet-stream', upsert: true });
        
        if (uploadErr) throw uploadErr;
        const { data: publicData } = supabase.storage.from(MODEL_PHOTOSHEET_BUCKET).getPublicUrl(objectPath);
        uploadedUrls[key] = publicData.publicUrl;
      }

      // Determine the primary fallback URL
      const primaryUrl = uploadedUrls.front || uploadedUrls.closeup || uploadedUrls.composite || Object.values(uploadedUrls)[0] || '';

      const { data: pub, error: pubErr } = await supabase
        .from('models_public')
        .insert({
          id: modelId,
          nickname: nickname.trim(),
          primary_photo_url: primaryUrl,
          composite_url: primaryUrl, // Fallback for backward compatibility
          photos: uploadedUrls,
          physical_description: physicalDescription.trim() || null,
        })
        .select('id, nickname')
        .maybeSingle();
      
      if (pubErr || !pub) throw pubErr ?? new Error('Insert failed');

      director.push(
        'Dr. Director',
        `New 4-angle model added — ${pub.nickname}. Ready for Dr. Stylist to compose looks with maximum consistency.`,
      );

      setStep('done');
      setTimeout(onSaved, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      setStep('form');
    }
  };

  const canSave = Boolean(nickname.trim() && (files.front || files.closeup || files.side || files.back));

  const AngleUploader = ({ angleKey, label }: { angleKey: keyof typeof files, label: string }) => {
    const previewUrl = previews[angleKey];
    return (
      <div className="flex flex-col gap-1">
        <div className="text-[11px] uppercase tracking-[0.1em] text-neutral-500 font-medium">{label}</div>
        <label
          className={`relative rounded-lg border-2 h-[180px] overflow-hidden ${
            previewUrl ? 'border-solid border-transparent' : 'border-dashed border-lab-border-light dark:border-lab-border cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition'
          } grid place-items-center bg-black/[0.02] dark:bg-white/[0.02]`}
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(angleKey, f);
              e.target.value = '';
            }}
          />
          {previewUrl ? (
            <>
              <img src={previewUrl} alt={label} className="absolute inset-0 w-full h-full object-cover" />
              <button
                onClick={(e) => { e.preventDefault(); clearSheet(angleKey); }}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full grid place-items-center bg-black/60 text-white hover:bg-rose-500"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <div className="text-center p-2">
              <Upload className="w-4 h-4 text-cobalt dark:text-indigo_electric mx-auto mb-1.5" />
              <div className="text-[10px] text-neutral-500">Upload</div>
            </div>
          )}
        </label>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl h-full bg-alabaster dark:bg-obsidian border-l border-lab-border-light dark:border-lab-border overflow-y-auto"
      >
        <div className="sticky top-0 z-10 bg-alabaster/90 dark:bg-obsidian/90 backdrop-blur-xl border-b border-lab-border-light dark:border-lab-border px-6 py-4 flex items-center justify-between">
          <div>
            <div className="eyebrow">Dr. Body</div>
            <div className="font-display text-2xl mt-0.5">Add new model</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full grid place-items-center border border-lab-border-light dark:border-lab-border hover:bg-black/5 dark:hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          <section>
            <div className="flex items-center gap-2 mb-4">
              <FileImage className="w-4 h-4 text-cobalt dark:text-indigo_electric" />
              <div>
                <h3 className="font-medium">Model Perspectives</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Upload 6 distinct angles for the highest AI face & body consistency.</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <AngleUploader angleKey="front" label="Front View" />
              <AngleUploader angleKey="side" label="Side View" />
              <AngleUploader angleKey="back" label="Back View" />
              <AngleUploader angleKey="closeup" label="Face Closeup" />
              <AngleUploader angleKey="left" label="Left Profile" />
              <AngleUploader angleKey="right" label="Right Profile" />
            </div>
          </section>

          <section>
            <label className="block">
              <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1.5">Internal Nickname</div>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Model 01"
                className="lab-input"
              />
            </label>
          </section>

          <section>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Physical Description</div>
              <button 
                onClick={(e) => { e.preventDefault(); analyzeBody(); }}
                disabled={isAnalyzing} 
                className="text-[10px] uppercase tracking-[0.1em] font-medium text-cobalt dark:text-indigo_electric hover:underline disabled:opacity-50 flex items-center gap-1"
              >
                {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Auto-Analyze
              </button>
            </div>
            <textarea
              value={physicalDescription}
              onChange={(e) => setPhysicalDescription(e.target.value)}
              placeholder="e.g. Stocky, heavily built, plus-size body type with broad shoulders. Average height. Olive skin tone."
              className="lab-input min-h-[96px] resize-y"
            />
          </section>

          {error && <div className="text-xs text-rose-500 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">{error}</div>}

          <div className="flex items-center gap-3 pt-2">
            <button disabled={!canSave || step === 'saving'} onClick={save} className="btn-primary disabled:opacity-40">
              {step === 'saving' && (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>)}
              {step === 'done' && (<><Check className="w-3.5 h-3.5" /> Added</>)}
              {step === 'form' && (<><Check className="w-3.5 h-3.5" /> Save model</>)}
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-full border border-lab-border-light dark:border-lab-border text-sm hover:bg-black/5 dark:hover:bg-white/5">
              Cancel
            </button>
          </div>
        </div>
      </motion.aside>
    </motion.div>
  );
}

function fileExtensionFor(file: File) {
  const byType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  if (byType[file.type]) return byType[file.type];
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  return 'jpg';
}
