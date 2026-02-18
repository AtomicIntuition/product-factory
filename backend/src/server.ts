import express from "express";
import cors from "cors";
import { requireBackendSecret } from "./middleware/auth.js";
import { createRateLimiter } from "./middleware/rateLimit.js";
import { pipelineRouter } from "./routes/pipeline.js";
import { syncSales } from "@/lib/etsy/sync";
import { markStaleRunsFailed } from "@/lib/supabase/queries";

const app = express();
const port = parseInt(process.env.PORT ?? "3001", 10);

// CORS — allow the Vercel frontend
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
app.use(
  cors({
    origin: frontendUrl,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-backend-secret"],
  }),
);

app.use(express.json());

// Health check (no auth required)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Rate limiter for expensive pipeline operations: 5 requests/minute
const pipelineRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 });

// Pipeline routes (auth + rate limit required)
app.use("/api/pipeline", requireBackendSecret, pipelineRateLimiter, pipelineRouter);

// Sales sync endpoint (auth + rate limit required)
const syncRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 });
app.post("/api/sync-sales", requireBackendSecret, syncRateLimiter, async (_req, res) => {
  try {
    const result = await syncSales();
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync-sales] Error:", error);
    res.status(500).json({ error: message });
  }
});

app.listen(port, () => {
  console.log(`[backend] Factory backend listening on port ${port}`);
  console.log(`[backend] CORS origin: ${frontendUrl}`);

  // Clean up stale pipeline runs on startup
  markStaleRunsFailed()
    .then((count) => { if (count > 0) console.log(`[backend] Marked ${count} stale pipeline runs as failed`); })
    .catch((err) => console.error("[backend] Stale run cleanup failed:", err));

  // Clean up stale runs every 30 minutes
  setInterval(() => {
    markStaleRunsFailed()
      .then((count) => { if (count > 0) console.log(`[backend] Marked ${count} stale pipeline runs as failed`); })
      .catch((err) => console.error("[backend] Stale run cleanup failed:", err));
  }, 30 * 60 * 1000).unref();

  // Initial sales sync after 5 seconds
  setTimeout(() => {
    syncSales().catch((err) => console.error("[sync] Initial sales sync failed:", err));
  }, 5_000);

  // Hourly sales sync
  setInterval(() => {
    syncSales().catch((err) => console.error("[sync] Scheduled sales sync failed:", err));
  }, 60 * 60 * 1000).unref();
});
