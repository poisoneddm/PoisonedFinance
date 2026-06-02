CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT        NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bank_connections (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider           TEXT        NOT NULL,
  access_token_enc   TEXT        NOT NULL,
  refresh_token_enc  TEXT        NOT NULL,
  token_expires_at   TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE linked_accounts (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id  UUID        NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
  provider       TEXT        NOT NULL DEFAULT 'truelayer',
  external_id    TEXT        NOT NULL,
  account_name   TEXT        NOT NULL,
  account_type   TEXT        NOT NULL,
  currency       TEXT        NOT NULL DEFAULT 'GBP',
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, external_id)
);

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  meta_bucket TEXT NOT NULL CHECK (meta_bucket IN ('needs', 'wants', 'savings')),
  color_hex   TEXT NOT NULL
);

CREATE TABLE categorisation_rules (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_pattern TEXT        NOT NULL,
  category_id      UUID        NOT NULL REFERENCES categories(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, merchant_pattern)
);

CREATE TABLE transactions (
  id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id             UUID        NOT NULL REFERENCES linked_accounts(id) ON DELETE CASCADE,
  user_id                UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id            TEXT        NOT NULL,
  merchant_name          TEXT,
  description            TEXT        NOT NULL,
  amount_pence           INTEGER     NOT NULL,
  currency               TEXT        NOT NULL DEFAULT 'GBP',
  transaction_date       DATE        NOT NULL,
  posted_date            DATE,
  category_id            UUID        REFERENCES categories(id),
  categorisation_source  TEXT        CHECK (categorisation_source IN ('rule', 'ai', 'manual', 'confirmed')),
  needs_review           BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, external_id)
);

CREATE INDEX idx_transactions_user_date ON transactions (user_id, transaction_date);
CREATE INDEX idx_transactions_needs_review ON transactions (user_id, needs_review) WHERE needs_review = TRUE;

CREATE TABLE monthly_goals (
  id         UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year       INTEGER NOT NULL,
  month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  needs_pct  INTEGER NOT NULL DEFAULT 40,
  wants_pct  INTEGER NOT NULL DEFAULT 20,
  savings_pct INTEGER NOT NULL DEFAULT 40,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, year, month),
  CONSTRAINT pct_sum_100 CHECK (needs_pct + wants_pct + savings_pct = 100)
);
