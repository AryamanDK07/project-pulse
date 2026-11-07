// Embedding generation for proposal similarity (384 dimensions, matches vector(384)).
//
// EMBEDDING_PROVIDER selects the model. Use ONE provider per database — vectors from
// different models are not comparable (run `npm run db:reembed` after switching).
//   minilm (default) — sentence-transformers/all-MiniLM-L6-v2 run locally through
//                      @huggingface/transformers (ONNX). Real semantic embeddings, no API key.
//                      The ~90 MB model is downloaded from Hugging Face on first use and cached.
//   openai           — text-embedding-3-small requested at 384 dims (needs OPENAI_API_KEY).
//   hash             — deterministic offline bag-of-words "hashing trick". Matches shared
//                      WORDS, not meaning. Only for machines with no internet at all.
export const EMBEDDING_DIM = 384;

export type EmbeddingProvider = 'minilm' | 'openai' | 'hash';

export function embeddingProvider(): EmbeddingProvider {
  const p = (process.env.EMBEDDING_PROVIDER ?? 'minilm').toLowerCase();
  if (p === 'minilm' || p === 'openai' || p === 'hash') return p;
  throw new Error(`Unknown EMBEDDING_PROVIDER "${p}" (use minilm, openai or hash)`);
}

/** Default review threshold per provider (cosine similarity, 0..1). */
export function defaultThreshold(): number {
  if (process.env.SIMILARITY_THRESHOLD) return Number(process.env.SIMILARITY_THRESHOLD);
  return { minilm: 0.6, openai: 0.6, hash: 0.3 }[embeddingProvider()];
}

/* ── hash provider ─────────────────────────────────────────────────── */
const STOP = new Set(('a an the and or of to in on for with by from at as is are be this that these those it its ' +
  'using use based system tool platform application app').split(' '));

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function hashEmbedding(text: string): number[] {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));
  const features = [...tokens, ...tokens.slice(1).map((t, i) => `${tokens[i]}_${t}`)]; // unigrams + bigrams
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  for (const f of features) {
    const h = fnv1a(f);
    v[h % EMBEDDING_DIM] += (h >>> 16) & 1 ? 1 : -1; // signed hashing reduces collision bias
  }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
}

/* ── minilm provider (sentence-transformer, local ONNX) ────────────── */
type Extractor = (text: string, opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>;
const g = globalThis as unknown as { __pulseExtractor?: Promise<Extractor> };

async function minilmExtractor(): Promise<Extractor> {
  g.__pulseExtractor ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    if (process.env.TRANSFORMERS_CACHE) env.cacheDir = process.env.TRANSFORMERS_CACHE;
    if (process.env.TRANSFORMERS_LOCAL_MODELS) {       // optional: pre-downloaded model folder
      env.localModelPath = process.env.TRANSFORMERS_LOCAL_MODELS;
      env.allowRemoteModels = false;
    }
    return (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' })) as unknown as Extractor;
  })();
  try { return await g.__pulseExtractor; }
  catch (e) { g.__pulseExtractor = undefined; throw new Error(`Could not load the MiniLM model: ${(e as Error).message}`); }
}

/* ── public API ────────────────────────────────────────────────────── */
export async function embedText(text: string): Promise<{ vector: number[]; model: string }> {
  const provider = embeddingProvider();
  if (provider === 'hash') return { vector: hashEmbedding(text), model: 'local-hash-384' };

  if (provider === 'minilm') {
    const extract = await minilmExtractor();
    const out = await extract(text, { pooling: 'mean', normalize: true });
    return { vector: Array.from(out.data), model: 'all-MiniLM-L6-v2' };
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('EMBEDDING_PROVIDER=openai needs OPENAI_API_KEY');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text, dimensions: EMBEDDING_DIM }),
  });
  if (!res.ok) throw new Error(`Embedding API failed: ${res.status}`); // never silently mix models
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return { vector: data.data[0].embedding, model: 'text-embedding-3-small@384' };
}

/** pgvector text literal, e.g. "[0.1,0.2,...]" — cast with $1::vector. */
export const toPgVector = (v: number[]) => `[${v.join(',')}]`;

/** The text that represents a proposal in vector space: title, abstract, problem, objectives, scope. */
export function proposalText(p: {
  title: string; abstract: string; problem_statement?: string | null;
  objectives?: string[] | null; scope?: string | null;
}): string {
  return [
    p.title,
    p.abstract,
    p.problem_statement ? `Problem: ${p.problem_statement}` : '',
    p.objectives?.length ? `Objectives: ${p.objectives.join('; ')}` : '',
    p.scope ? `Scope: ${p.scope}` : '',
  ].filter(Boolean).join('. ');
}
