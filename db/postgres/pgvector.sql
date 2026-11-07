-- =====================================================================
-- Project Pulse :: pgvector setup for proposal originality checks
-- Embeddings are 384-d (matches src/lib/embeddings.ts). Cosine distance (<=>)
-- is used: similarity = 1 - cosine_distance.
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE project_embeddings (
  project_id   BIGINT PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
  embedding    vector(384) NOT NULL,
  model        TEXT NOT NULL,            -- e.g. 'local-hash-384' or 'text-embedding-3-small@384'
  content_hash TEXT,                     -- sha256(title || abstract) to detect stale vectors
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Approximate-nearest-neighbour index (HNSW) for cosine distance.
CREATE INDEX idx_project_embeddings_hnsw
  ON project_embeddings USING hnsw (embedding vector_cosine_ops);

-- k-NN lookup returning cosine SIMILARITY (1 = identical direction).
CREATE OR REPLACE FUNCTION fn_similar_projects(
  p_embedding      vector(384),
  p_limit          INT     DEFAULT 5,
  p_exclude        BIGINT  DEFAULT NULL,
  p_min_similarity NUMERIC DEFAULT 0
)
RETURNS TABLE (project_id BIGINT, title TEXT, status TEXT, similarity NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT p.project_id,
         p.title,
         p.status,
         ROUND((1 - (e.embedding <=> p_embedding))::numeric, 4) AS similarity
  FROM   project_embeddings e
  JOIN   projects p ON p.project_id = e.project_id
  WHERE  (p_exclude IS NULL OR e.project_id <> p_exclude)
    AND  (1 - (e.embedding <=> p_embedding)) >= p_min_similarity
  ORDER  BY e.embedding <=> p_embedding
  LIMIT  p_limit;
$$;
