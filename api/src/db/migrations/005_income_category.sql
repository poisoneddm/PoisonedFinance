-- A dedicated Income meta-bucket + category. Salaries and other income can now be
-- tagged explicitly (by the AI, a rule, or the user) instead of relying solely on
-- "uncategorised credit = income". Income-tagged credits count as income and,
-- crucially, never get netted against a spend bucket if mis-tagged.
--
-- Widen the meta_bucket CHECK to allow 'income'. The default name for the inline
-- column CHECK in 001 is categories_meta_bucket_check.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_meta_bucket_check;
ALTER TABLE categories ADD CONSTRAINT categories_meta_bucket_check
  CHECK (meta_bucket IN ('needs', 'wants', 'savings', 'income'));

INSERT INTO categories (name, meta_bucket, color_hex) VALUES
  ('Income', 'income', '#fbbf24')
ON CONFLICT (name) DO NOTHING;
