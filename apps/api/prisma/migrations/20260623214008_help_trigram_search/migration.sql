-- Typo-tolerante zoekfunctie op KB-artikelen
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_help_articles_title_trgm
  ON imp_help_articles USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_help_articles_excerpt_trgm
  ON imp_help_articles USING gin (excerpt gin_trgm_ops);

-- Snelle array-overlap (&&) op module_keys voor contextuele suggesties
CREATE INDEX IF NOT EXISTS idx_help_articles_module_keys
  ON imp_help_articles USING gin (module_keys);
