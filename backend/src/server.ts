import express from "express";
import cors from "cors";
import { requireBackendSecret } from "./middleware/auth.js";
import { pipelineRouter } from "./routes/pipeline.js";

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

// Pipeline routes (auth required)
app.use("/api/pipeline", requireBackendSecret, pipelineRouter);

app.listen(port, () => {
  console.log(`[backend] Factory backend listening on port ${port}`);
  console.log(`[backend] CORS origin: ${frontendUrl}`);
});
