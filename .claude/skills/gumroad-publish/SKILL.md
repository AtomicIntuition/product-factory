---
name: gumroad-publish
description: Publish a generated product to Gumroad via their API. Handles product creation, file upload, pricing, and activation. Use when a product has been reviewed and approved for publishing.
---

When publishing to Gumroad:

1. Validate the product record has all required fields (content file, title, description, price, tags)
2. Create product via Gumroad API
3. Upload the product file(s)
4. Set pricing and currency
5. Add tags and categorization
6. Set product to published/live
7. Save the Gumroad product URL and ID back to supabase
8. Update product status to "published"

Handle errors gracefully — if Gumroad API fails, set status to "publish_failed" with error details.
Always respect Gumroad API rate limits.
