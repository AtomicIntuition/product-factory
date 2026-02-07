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
