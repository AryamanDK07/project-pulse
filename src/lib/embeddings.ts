// Embedding generation for proposal similarity (384 dimensions, matches vector(384)).
//  - With OPENAI_API_KEY: text-embedding-3-small requested at 384 dims.
//  - Otherwise: deterministic offline "hashing trick" bag-of-words embedder so the demo
//    works with no external service. Use ONE provider per database.
export const EMBEDDING_DIM = 384;

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

export async function embedText(text: string): Promise<{ vector: number[]; model: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { vector: hashEmbedding(text), model: 'local-hash-384' };
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
