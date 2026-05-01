import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'model-photosheets';

function loadEnv() {
  const env = {};
  const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=\s]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    env[key] = value.replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

function isHostedUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function dataUrlToBuffer(dataUrl) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) throw new Error('Invalid data URL');
  const mimeType = match[1] || 'image/jpeg';
  const isBase64 = Boolean(match[2]);
  const body = match[3] || '';
  const buffer = isBase64
    ? Buffer.from(body, 'base64')
    : Buffer.from(decodeURIComponent(body), 'utf8');
  return { buffer, mimeType };
}

function extensionForMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function listModels(supabase) {
  const all = [];
  const pageSize = 100;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('models_public')
      .select('id,nickname,primary_photo_url,composite_url,photos')
      .range(from, to);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  }

  const supabase = createClient(url, key);
  const models = await listModels(supabase);
  const candidates = models.filter((model) => isDataUrl(model.composite_url));

  console.log(`Found ${candidates.length} model photosheet(s) stored as data URLs.`);

  for (const model of candidates) {
    const { buffer, mimeType } = dataUrlToBuffer(model.composite_url);
    const ext = extensionForMime(mimeType);
    const objectPath = `models/${model.id}/photosheet.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, buffer, {
        contentType: mimeType,
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    const publicUrl = publicData.publicUrl;
    if (!isHostedUrl(publicUrl)) {
      throw new Error(`Could not create public URL for ${model.nickname || model.id}`);
    }

    const photos = model.photos && typeof model.photos === 'object' && !Array.isArray(model.photos)
      ? { ...model.photos, composite: publicUrl }
      : { composite: publicUrl };

    const { error: updateError } = await supabase
      .from('models_public')
      .update({
        primary_photo_url: publicUrl,
        composite_url: publicUrl,
        photos,
      })
      .eq('id', model.id);
    if (updateError) throw updateError;

    console.log(`Backfilled ${model.nickname || model.id}: ${publicUrl}`);
  }

  console.log('Model photosheet backfill complete.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
