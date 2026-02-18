import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
}): (req: Request, res: Response, next: NextFunction) => void {
  const { windowMs, maxRequests } = options;
  const store = new Map<string, RateLimitEntry>();

  // Clean up expired entries every minute
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 60_000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip =
      (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined) ??
      req.socket.remoteAddress ??
      "unknown";

    const now = Date.now();
    let entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Too many requests",
        retryAfter,
      });
      return;
    }

    next();
  };
}
