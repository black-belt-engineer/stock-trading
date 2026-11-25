-- Baseline: the tables phases 15 and 16 created at start-up with CREATE TABLE IF NOT EXISTS.
-- Kept idempotent, so a database that already has them records this migration and moves on.
-- Every later migration is plain DDL: it runs exactly once.
--
-- No foreign keys to users: users live in Keycloak. Deleting a user's rows is K6's job
-- (UserDataRepository), which must list every table that has a user_id.

-- P1: one row per starred symbol.
CREATE TABLE IF NOT EXISTS watchlist_items (
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol)
);

-- P2: one row per alert, active while triggered_at is null.
CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  threshold NUMERIC(18, 2) NOT NULL CHECK (threshold > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggered_at TIMESTAMPTZ NULL,
  triggered_price NUMERIC(18, 2) NULL
);
CREATE INDEX IF NOT EXISTS price_alerts_user_active
  ON price_alerts (user_id, created_at) WHERE triggered_at IS NULL;
CREATE INDEX IF NOT EXISTS price_alerts_user_history
  ON price_alerts (user_id, triggered_at DESC) WHERE triggered_at IS NOT NULL;
