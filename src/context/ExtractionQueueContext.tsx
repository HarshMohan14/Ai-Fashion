import { createContext, useContext, useState, type ReactNode, useCallback, useRef, useEffect } from 'react';
import { analyzeOutfit, cropItems } from '../lib/drScientist';
import { reRenderItem } from '../lib/nanoBanana';
import { supabase } from '../lib/supabase';
import { LabItem, classifyItem } from '../lib/extractionUtils';

export type JobStatus = 'scanning' | 'review_pending' | 'rendering' | 'verify_pending' | 'dispatched' | 'failed';

export type ExtractionJob = {
  id: string;
  originalImageSrc: string;
  originalImageFile: File;
  items: LabItem[];
  status: JobStatus;
  mocked: boolean;
  model: string | null;
  error?: string;
  progressMessage?: string;
};

type ExtractionQueueContextType = {
  jobs: ExtractionJob[];
  addJob: (file: File) => string;
  updateJob: (id: string, patch: Partial<ExtractionJob>) => void;
  updateJobItem: (jobId: string, itemId: string, patch: Partial<LabItem>) => void;
  removeJobItem: (jobId: string, itemId: string) => void;
  startRendering: (jobId: string) => Promise<void>;
  dismissJob: (jobId: string) => void;
  dispatchItem: (jobId: string, itemId: string) => Promise<void>;
  regenerateItem: (jobId: string, itemId: string) => Promise<void>;
};

export const ExtractionQueueContext = createContext<ExtractionQueueContextType | null>(null);

export function ExtractionQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ExtractionJob[]>([]);
  const jobsRef = useRef<ExtractionJob[]>([]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const updateJob = useCallback((id: string, patch: Partial<ExtractionJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const updateJobItem = useCallback((jobId: string, itemId: string, patch: Partial<LabItem>) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          items: j.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
        };
      }),
    );
  }, []);

  const removeJobItem = useCallback((jobId: string, itemId: string) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== jobId) return j;
        return {
          ...j,
          items: j.items.filter((i) => i.id !== itemId),
        };
      }),
    );
  }, []);

  const addJob = useCallback((file: File) => {
    const id = crypto.randomUUID();
    const originalImageSrc = URL.createObjectURL(file);
    const newJob: ExtractionJob = {
      id,
      originalImageSrc,
      originalImageFile: file,
      items: [],
      status: 'scanning',
      mocked: false,
      model: null,
      progressMessage: 'Scanning image with Dr. Scientist...',
    };
    setJobs((prev) => [...prev, newJob]);

    // Kick off scanning asynchronously
    (async () => {
      try {
        const result = await analyzeOutfit(file);
        if (result.items.length === 0) {
          updateJob(id, {
            status: 'failed',
            error: 'Dr. Scientist could not detect any items. Try a clearer photo.',
            progressMessage: 'No items detected',
          });
          return;
        }

        const cropped = await cropItems(originalImageSrc, result.items);
        const tagged: LabItem[] = cropped.map((c) => {
          const { category, subcategory } = classifyItem(c.name, c.category);
          return {
            ...c,
            targetCategory: category,
            targetSubcategory: subcategory,
            renderStatus: 'pending',
          };
        });

        // Insert into extractions table tracking
        try {
          const { data: auth } = await supabase.auth.getSession();
          if (auth.session) {
            await supabase.from('extractions').insert({ 
                notes: '', 
                mocked: result.mocked, 
                item_count: tagged.length, 
                model: result.model ?? null 
            });
          }
        } catch (error) {
          console.warn('[ExtractionQueue] Could not record extraction metadata:', error);
        }

        updateJob(id, {
          status: 'review_pending',
          items: tagged,
          mocked: result.mocked,
          model: result.model ?? null,
          progressMessage: 'Ready for review',
        });
      } catch (err) {
        updateJob(id, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Scanning failed',
          progressMessage: 'Scanning failed',
        });
      }
    })();

    return id;
  }, [updateJob]);

  const startRendering = useCallback(async (jobId: string) => {
    const job = jobsRef.current.find((j) => j.id === jobId);
    if (!job) return;

    updateJob(jobId, { status: 'rendering', progressMessage: 'Rendering items...' });

    const queue = job.items.filter((i) => !i.renderedDataUrl && i.cropDataUrl);
    let completedCount = 0;
    const totalCount = queue.length;

    await Promise.allSettled(
      queue.map(async (it) => {
        updateJobItem(jobId, it.id, { renderStatus: 'pending' });
        try {
          const res = await reRenderItem({
            cropDataUrl: it.cropDataUrl!,
            category: it.targetCategory || it.category,
            colorHex: it.color,
            fabric: it.fabric,
          });
          updateJobItem(jobId, it.id, {
            renderedDataUrl: res.dataUrl,
            renderStatus: 'ready',
            renderModel: res.model,
          });
        } catch (e) {
          console.error('Render failed for item', it.id, e);
          updateJobItem(jobId, it.id, { renderStatus: 'failed' });
        } finally {
          completedCount++;
          updateJob(jobId, { progressMessage: `Rendered ${completedCount}/${totalCount} items` });
        }
      })
    );

    updateJob(jobId, { status: 'verify_pending', progressMessage: 'Awaiting approval' });
  }, [updateJob, updateJobItem]);

  const dispatchItem = useCallback(async (jobId: string, itemId: string) => {
    const job = jobsRef.current.find((j) => j.id === jobId);
    if (!job) return;
    const it = job.items.find((i) => i.id === itemId);
    if (!it || !it.renderedDataUrl || it.dispatched) return;

    try {
      const parts = it.renderedDataUrl.split(',');
      const match = parts[0].match(/:(.*?);/);
      const mime = match ? match[1] : 'image/png';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      const blob = new Blob([u8arr], { type: mime });

      const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
      const path = `wardrobe-items/${jobId}-${it.id}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('model-photosheets')
        .upload(path, blob, { contentType: mime, upsert: true });
      if (uploadError) throw uploadError;
        
      const { data: { publicUrl } } = supabase.storage.from('model-photosheets').getPublicUrl(path);

      const { error: insertError } = await supabase.from('wardrobe_items').insert({
        name: it.name,
        category: it.targetCategory || it.category,
        subcategory: it.targetSubcategory || '',
        image_url: publicUrl,
        color_hex: it.color,
        fabric: it.fabric,
        fit: it.fit || '',
        status: 'unchecked',
        parent_model_id: jobId,
        source: 'extraction',
        rendered_at: new Date().toISOString(),
        success_rate: Math.round((it.confidence || 0.8) * 100),
        popularity: 0,
      });
      if (insertError) throw insertError;

      updateJobItem(jobId, it.id, { dispatched: true });

      // Check if all items are dispatched
      const updatedJob = jobsRef.current.find((j) => j.id === jobId);
      if (updatedJob && updatedJob.items.every((i) => i.dispatched)) {
        updateJob(jobId, { status: 'dispatched', progressMessage: 'Extraction complete' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send item to wardrobe.';
      console.error('Dispatch failed', err);
      updateJob(jobId, { error: message, progressMessage: `Dispatch failed: ${message}` });
    }
  }, [updateJob, updateJobItem]);

  const regenerateItem = useCallback(async (jobId: string, itemId: string) => {
    const job = jobsRef.current.find((j) => j.id === jobId);
    if (!job) return;
    const it = job.items.find((i) => i.id === itemId);
    if (!it || !it.cropDataUrl) return;

    updateJobItem(jobId, itemId, { renderStatus: 'pending', renderedDataUrl: undefined });
    updateJob(jobId, { progressMessage: 'Regenerating item...' });

    try {
      const res = await reRenderItem({
        cropDataUrl: it.cropDataUrl,
        category: it.targetCategory || it.category,
        colorHex: it.color,
        fabric: it.fabric,
      });
      updateJobItem(jobId, itemId, {
        renderedDataUrl: res.dataUrl,
        renderStatus: 'ready',
        renderModel: res.model,
      });
      updateJob(jobId, { progressMessage: 'Awaiting approval' });
    } catch {
      updateJobItem(jobId, itemId, { renderStatus: 'failed' });
      updateJob(jobId, { progressMessage: 'Regeneration failed' });
    }
  }, [updateJob, updateJobItem]);

  const dismissJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  return (
    <ExtractionQueueContext.Provider value={{ jobs, addJob, updateJob, updateJobItem, removeJobItem, startRendering, dismissJob, dispatchItem, regenerateItem }}>
      {children}
    </ExtractionQueueContext.Provider>
  );
}

export function useExtractionQueue() {
  const ctx = useContext(ExtractionQueueContext);
  if (!ctx) throw new Error('Missing ExtractionQueueProvider');
  return ctx;
}
