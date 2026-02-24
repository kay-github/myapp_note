type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hit = buckets.get(key);

  if (!hit || now > hit.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (hit.count >= max) {
    return false;
  }

  hit.count += 1;
  buckets.set(key, hit);
  return true;
}
