import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string;

const SUPABASE_READ_RETRIES = 2;

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

function isReadMethod(method: string) {
  return method === 'GET' || method === 'HEAD';
}

function isAbortError(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function waitForRetry(attempt: number) {
  const jitter = Math.floor(Math.random() * 150);
  await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** attempt + jitter));
}

const retryingSupabaseFetch: typeof fetch = async (input, init) => {
  const method = requestMethod(input, init);
  if (!isReadMethod(method)) return fetch(input, init);

  let lastError: unknown;
  for (let attempt = 0; attempt <= SUPABASE_READ_RETRIES; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (!isRetryableStatus(response.status) || attempt >= SUPABASE_READ_RETRIES) {
        return response;
      }
      await waitForRetry(attempt);
    } catch (error) {
      if (isAbortError(error) || attempt >= SUPABASE_READ_RETRIES) throw error;
      lastError = error;
      console.warn('[Supabase] Read request failed transiently; retrying...', error);
      await waitForRetry(attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Supabase read request failed.');
};

export const supabase = createClient(url, publishableKey, {
  global: {
    fetch: retryingSupabaseFetch,
  },
});

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
