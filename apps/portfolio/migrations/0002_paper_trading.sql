-- P3: paper trading (Q8: $100,000 cash, market orders, whole shares, long only, no fees).
-- Amounts are NUMERIC and the service reads them as text; nothing here is a float.
-- Every table joins UserDataRepository (K6). Orders are deleted with the account (owner's decision).

-- Created lazily on first access (INSERT … ON CONFLICT DO NOTHING). Every order locks this row.
CREATE TABLE accounts (
  user_id UUID PRIMARY KEY,
  cash NUMERIC(18, 2) NOT NULL CHECK (cash >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A position sold in full is deleted, so quantity is always positive.
CREATE TABLE positions (
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  avg_cost NUMERIC(18, 4) NOT NULL CHECK (avg_cost > 0),
  PRIMARY KEY (user_id, symbol)
);

-- The ledger. `total` is rounded once, when the order fills, and never recomputed.
-- `realized_pnl` is set on sells only: (price − avg_cost) × quantity.
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price NUMERIC(18, 4) NOT NULL CHECK (price > 0),
  total NUMERIC(18, 2) NOT NULL CHECK (total > 0),
  realized_pnl NUMERIC(18, 2) NULL,
  client_order_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_order_id),
  CHECK ((side = 'sell') = (realized_pnl IS NOT NULL))
);

-- Order history, newest first, paged by (created_at, id).
CREATE INDEX orders_user_created ON orders (user_id, created_at DESC, id DESC);
