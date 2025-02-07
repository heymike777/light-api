export const kAddUniqueTransactionLuaOld = `
if redis.call("SISMEMBER", KEYS[1], ARGV[1]) == 1 then
  return 0
else
  redis.call("SADD", KEYS[1], ARGV[1])

  redis.call("LPUSH", KEYS[2], ARGV[2])
  redis.call("LTRIM", KEYS[2], 0, 99)
  return 1
end`;


export const kAddUniqueTransactionLua = `
-- KEYS[1] = the ZSET key for signatures (e.g. "user:123:signatures")
-- KEYS[2] = the LIST key for transactions (e.g. "user:123:transactions")
--
-- ARGV[1] = signature string (the unique ID)
-- ARGV[2] = score (e.g. time as a number/string that can be tonumber()'ed)
-- ARGV[3] = the full transaction JSON
--
-- Returns:
--   0 if the signature was already present in the ZSET
--   1 if this is a new signature (and the transaction was added)

local signature = ARGV[1]
local score = tonumber(ARGV[2])
local transactionJson = ARGV[3]

-- 1) Check if signature already exists in the ZSET
local existingScore = redis.call("ZSCORE", KEYS[1], signature)
if existingScore then
  -- Signature is already in the ZSET => do nothing
  return 0
end

-- 2) Add signature with the given score (e.g. a timestamp)
redis.call("ZADD", KEYS[1], score, signature)

-- 3) If more than 100 signatures, remove the oldest (lowest scores) so that only 100 remain
local zsetSize = redis.call("ZCARD", KEYS[1])
if zsetSize > 100 then
  -- Remove the items from rank 0 up to (zsetSize - 101),
  -- which are the "oldest" if scores are ascending by time
  redis.call("ZREMRANGEBYRANK", KEYS[1], 0, zsetSize - 101)
end

-- 4) Insert the transaction JSON into the LIST, then trim to latest 100
redis.call("LPUSH", KEYS[2], transactionJson)
redis.call("LTRIM", KEYS[2], 0, 99)

return 1
`;

// redis.call("SADD", KEYS[1], ARGV[1])
