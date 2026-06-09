import { Redis } from "@upstash/redis";

type RateLimitEntry = {
  count: number;
  expires: number;
};

type RateLimitResult = {
  success: boolean;
  remaining: number;
  retryAfter?: number;
};

const memoryStore = new Map<string, RateLimitEntry>();

const hasUpstashConfig = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const redis = hasUpstashConfig ? Redis.fromEnv() : null;

function localRateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const existing = memoryStore.get(key);

  if (!existing || existing.expires < now) {
    memoryStore.set(key, {
      count: 1,
      expires: now + windowMs,
    });

    return {
      success: true,
      remaining: limit - 1,
    };
  }

  if (existing.count >= limit) {
    return {
      success: false,
      remaining: 0,
      retryAfter: Math.ceil((existing.expires - now) / 1000),
    };
  }

  existing.count += 1;

  return {
    success: true,
    remaining: limit - existing.count,
  };
}

export async function rateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  if (!redis) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Upstash Redis is not configured");
    }

    return localRateLimit({ key, limit, windowMs });
  }

  const redisKey = `rate-limit:${key}`;
  const count = await redis.incr(redisKey);

  if (count === 1) {
    await redis.pexpire(redisKey, windowMs);
  }

  const ttl = await redis.pttl(redisKey);
  const retryAfter = ttl > 0 ? Math.ceil(ttl / 1000) : Math.ceil(windowMs / 1000);

  if (count > limit) {
    return {
      success: false,
      remaining: 0,
      retryAfter,
    };
  }

  return {
    success: true,
    remaining: Math.max(limit - count, 0),
    retryAfter,
  };
}