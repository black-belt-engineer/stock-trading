/**
 * Applies one tick to a symbol's Redis state in a single atomic step, so two
 * consumers handling the same symbol cannot lose each other's updates and a
 * redelivered tick is never counted twice.
 *
 * KEYS: 1 latest-price record, 2 sparkline, 3 price-updates stream, 4 idempotency marker.
 *
 * ARGV:
 *   1 symbol, 2 name, 3 price, 4 size, 5 side, 6 timestamp (epoch ms),
 *   7 sessionId of the tick, 8 marker TTL in seconds, 9 sparkline member,
 *   10 sparkline points to keep, 11 stream MAXLEN,
 *   12 "1" when a baseline follows, else "0",
 *   13 baseline previous close, 14 open, 15 high, 16 low, 17 volume
 *      (each "" when unknown; the session values describe the ticks of this
 *      session stored before this one).
 *
 * Returns one of:
 *   "duplicate"       the marker exists: already applied, nothing written.
 *   "needs_baseline"  no usable record and no baseline given: nothing written;
 *                     call again with the baseline from Postgres.
 *   "older"           the tick is not newer than the record: the price and
 *                     change stay; a tick of the same session still counts
 *                     toward volume, high and low. No stream entry.
 *   "applied"         the record moved to this tick and a stream entry was added.
 *
 * The record it writes must match `LatestPriceSchema` in `@stock-platform/types`.
 * Lua's cjson writes numbers with 14 significant digits, which is exact for
 * cents, share counts and epoch milliseconds.
 */
export const APPLY_TICK_LUA = `
local latestKey, sparklineKey, streamKey, markerKey = KEYS[1], KEYS[2], KEYS[3], KEYS[4]

if redis.call('EXISTS', markerKey) == 1 then
  return 'duplicate'
end

local symbol, name = ARGV[1], ARGV[2]
local price, size, side = tonumber(ARGV[3]), tonumber(ARGV[4]), ARGV[5]
local timestamp, sessionId = tonumber(ARGV[6]), ARGV[7]
local markerTtl, sparklineMember = ARGV[8], ARGV[9]
local sparklineKeep, streamMaxlen = tonumber(ARGV[10]), ARGV[11]
local hasBaseline = ARGV[12] == '1'

local function isNumber(v) return type(v) == 'number' end

-- A record of the wrong shape (or the format before session values) counts as absent.
local function decodeRecord(raw)
  if not raw then return nil end
  local ok, r = pcall(cjson.decode, raw)
  if not ok or type(r) ~= 'table' then return nil end
  if type(r.sessionId) ~= 'string' or not isNumber(r.currentPrice) or not isNumber(r.previousClose)
    or not isNumber(r.open) or not isNumber(r.high) or not isNumber(r.low) or not isNumber(r.volume)
    or not isNumber(r.lastUpdated) or not isNumber(r.lastSize) or type(r.lastSide) ~= 'string'
    or type(r.tickDirection) ~= 'string' then
    return nil
  end
  return r
end

local function optionalNumber(s)
  if s == nil or s == '' then return nil end
  return tonumber(s)
end

local function changeOf(current, previousClose)
  local change = current - previousClose
  -- previousClose is never 0 for a real price; guard the division anyway.
  local percent = 0
  if previousClose ~= 0 then percent = change / previousClose * 100 end
  return change, percent
end

local function addSparklinePoint()
  redis.call('ZADD', sparklineKey, timestamp, sparklineMember)
  redis.call('ZREMRANGEBYRANK', sparklineKey, 0, -(sparklineKeep + 1))
end

local function markApplied()
  redis.call('SET', markerKey, '1', 'EX', markerTtl)
end

local prev = decodeRecord(redis.call('GET', latestKey))

if prev and timestamp <= prev.lastUpdated then
  -- Out of order. The price shown stays the newest one; a trade of the same
  -- session still happened, so it counts toward the day's volume and range.
  if prev.sessionId == sessionId then
    prev.high = math.max(prev.high, price)
    prev.low = math.min(prev.low, price)
    prev.volume = prev.volume + size
    redis.call('SET', latestKey, cjson.encode(prev))
  end
  addSparklinePoint()
  markApplied()
  return 'older'
end

local previousClose, open, high, low, volume, tickDirection

if prev and prev.sessionId == sessionId then
  previousClose = prev.previousClose
  open = prev.open
  high = math.max(prev.high, price)
  low = math.min(prev.low, price)
  volume = prev.volume + size
elseif prev then
  -- First tick of a new session. The last known price closes the session
  -- before, also when sessions without any tick lie in between.
  previousClose = prev.currentPrice
  open, high, low, volume = price, price, price, size
else
  if not hasBaseline then
    return 'needs_baseline'
  end
  -- Cold start: no record yet (empty Redis, a new symbol, or a record that was
  -- unreadable). With no earlier tick at all the first price is the previous
  -- close, so the change starts at 0%.
  previousClose = optionalNumber(ARGV[13]) or price
  local baseOpen = optionalNumber(ARGV[14])
  if baseOpen then
    open = baseOpen
    high = math.max(optionalNumber(ARGV[15]) or price, price)
    low = math.min(optionalNumber(ARGV[16]) or price, price)
    volume = (optionalNumber(ARGV[17]) or 0) + size
  else
    open, high, low, volume = price, price, price, size
  end
end

if prev == nil or price == prev.currentPrice then
  tickDirection = 'flat'
elseif price > prev.currentPrice then
  tickDirection = 'up'
else
  tickDirection = 'down'
end

local change, changePercent = changeOf(price, previousClose)

local record = {
  symbol = symbol,
  name = name,
  sessionId = sessionId,
  currentPrice = price,
  previousClose = previousClose,
  open = open,
  high = high,
  low = low,
  volume = volume,
  change = change,
  changePercent = changePercent,
  tickDirection = tickDirection,
  lastSize = size,
  lastSide = side,
  lastUpdated = timestamp,
}
local encoded = cjson.encode(record)

redis.call('SET', latestKey, encoded)
addSparklinePoint()
redis.call('XADD', streamKey, 'MAXLEN', '~', streamMaxlen, '*', 'symbol', symbol, 'payload', encoded)
markApplied()
return 'applied'
`;
