import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";

export function requireBackendSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = req.headers["x-backend-secret"];
  const expected = process.env.BACKEND_SECRET;

  if (!expected) {
    console.error("[auth] BACKEND_SECRET env var is not set");
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  if (
    typeof secret !== "string" ||
    secret.length !== expected.length ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
  ) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
