export const kAddUniqueTransactionLua = `
if redis.call("SISMEMBER", KEYS[1], ARGV[1]) == 1 then
  return 0
else
  redis.call("SADD", KEYS[1], ARGV[1])
  redis.call("LPUSH", KEYS[2], ARGV[2])
  redis.call("LTRIM", KEYS[2], 0, 99)
  return 1
end`;