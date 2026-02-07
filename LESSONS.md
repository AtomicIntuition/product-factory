# Lessons Learned

## Format
Each lesson: what went wrong, why, and the fix. Keep it short.

---

### 2026-02-07 — Generation Failed: JSON Truncation + Timeouts
**Problem:** Product generation failed 5 consecutive times with two error types: "Failed to parse Claude response as JSON" and "Request timed out."
**Cause:** `maxTokens: 8192` in generator.ts was too low for generating products with 120+ prompts. Claude's response hit the token limit, truncating the JSON mid-output, making it unparsable. Some requests also hit the 10-minute Anthropic SDK timeout because the model was producing massive output.
**Fix:**
1. Increased `maxTokens` from 8192 to 16384 in generator.ts
2. Added `stop_reason === "max_tokens"` check in client.ts to detect truncation early with a clear error message
3. Reduced prompt count guidance from "8-15 per section" to "5-10 per section (40-60 total)" to keep output size manageable
**Rule:** Always check `stop_reason` on Claude API responses. Size generation output expectations to fit within token limits with headroom. Test generation end-to-end before considering it done.

---

### 2026-02-07 — Vercel Fire-and-Forget Kills Background Work
**Problem:** Generation appeared to start (202 response returned) but then silently failed on Vercel. Worked fine on localhost.
**Cause:** On Vercel, serverless functions are killed as soon as the response is sent. A plain `executeGeneration().catch(...)` promise without `await` gets terminated mid-execution.
**Fix:** Used `after()` from `next/server` to register the generation promise. This tells Vercel to keep the function alive until the promise resolves, even after the response has been sent.
**Rule:** Never use fire-and-forget patterns on Vercel without wrapping in `after()`. Always test long-running background work on Vercel specifically — localhost behavior differs.

---

### 2026-02-07 — Blocking API Calls Cause Frontend "Instant Failure"
**Problem:** Clicking "Generate" on the frontend showed an instant "Failed to start generation" error, even though generation was actually running.
**Cause:** The POST `/api/pipeline` handler was `await`ing the full generation (1-3+ minutes). The browser fetch would time out or the user would see no response and assume failure. On Vercel, the 300s limit made it worse.
**Fix:** Made generation non-blocking — API returns `{ status: "started" }` with HTTP 202 immediately, then runs generation in background via `after()`. Frontend shows a success banner and polls for progress.
**Rule:** Any operation taking >10 seconds should return immediately and track progress asynchronously. Use polling + DB-stored progress for the frontend.

---

### 2026-02-07 — Streaming Progress is Better Than Time Estimates for AI
**Problem:** User wanted to know how long generation would take. Initial approach was elapsed time, then average-based estimates.
**Cause:** AI generation time is unpredictable — it depends on output length, model load, and content complexity. Average estimates are inaccurate and misleading.
**Fix:** Used Claude's streaming API to track actual token output in real-time. Progress = `tokens_so_far / max_tokens * 100`. Written to `pipeline_runs.metadata.progress` every 5%. Dashboard shows a live progress bar via 5s polling.
**Rule:** For AI generation, show token-based progress bars rather than time estimates. Stream the response and calculate percentage from token count vs max_tokens.

---

### 2026-02-07 — Turbopack Cache Corruption
**Problem:** Dev server crashed with "panicked thread" errors and corrupted `.sst` files after laptop was interrupted mid-session.
**Cause:** Turbopack's cache files got corrupted when the system was abruptly interrupted.
**Fix:** Deleted `.next/` and `node_modules/.cache/` directories, then restarted dev server.
**Rule:** If dev server shows internal panics or corruption errors, clear `.next/` and `node_modules/.cache/` before debugging further.

---

### 2026-02-07 — Stale "Running" Pipeline Runs After Server Crash
**Problem:** Dashboard showed a pipeline run stuck in "running" status with increasing elapsed time, but the generation had already completed (or the server had crashed).
**Cause:** Server died mid-generation so the pipeline run was never updated to "completed" or "failed".
**Fix:** Ran a one-time Supabase query to mark stale running records as failed. Long-term, should add a cleanup job for runs stuck in "running" beyond a timeout.
**Rule:** Always handle the case where a server dies mid-operation. Consider adding a TTL-based cleanup for pipeline runs stuck in "running" status.
