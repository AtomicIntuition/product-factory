import { etsy } from "@/lib/etsy/client";
import { getEnv } from "@/config/env";
import {
  getProductByListingId,
  saleExists,
  getLatestSaleTimestamp,
  insertSale,
} from "@/lib/supabase/queries";

export interface SyncResult {
  inserted: number;
  skipped: number;
  errors: number;
}

export async function syncSales(): Promise<SyncResult> {
  const env = getEnv();
  const shopId = env.ETSY_SHOP_ID;
  const result: SyncResult = { inserted: 0, skipped: 0, errors: 0 };

  // Determine start timestamp: latest sale minus 1 minute overlap, or 90 days ago
  const latestTimestamp = await getLatestSaleTimestamp();
  const minCreated = latestTimestamp
    ? Math.floor(new Date(latestTimestamp).getTime() / 1000) - 60
    : Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;

  let offset = 0;
  const limit = 25;
  let hasMore = true;

  while (hasMore) {
    const response = await etsy.getShopReceipts(shopId, {
      min_created: minCreated,
      limit,
      offset,
    });

    for (const receipt of response.results) {
      const receiptId = String(receipt.receipt_id);

      try {
        // Idempotency: skip already-recorded receipts
        if (await saleExists(receiptId)) {
          result.skipped++;
          continue;
        }

        // Match receipt transactions to our products
        for (const transaction of receipt.transactions) {
          const product = await getProductByListingId(transaction.listing_id);
          if (!product) {
            continue; // Unknown listing — not one of ours
          }

          const amountCents = transaction.price.amount / (transaction.price.divisor / 100);

          await insertSale({
            product_id: product.id,
            etsy_receipt_id: receiptId,
            amount_cents: Math.round(amountCents),
            currency: receipt.grandtotal.currency_code,
            buyer_email: receipt.buyer_email ?? "",
            sale_timestamp: new Date(receipt.create_timestamp * 1000).toISOString(),
          });

          result.inserted++;
        }
      } catch (error) {
        console.error(`[sync] Error processing receipt ${receiptId}:`, error);
        result.errors++;
      }
    }

    // Check if there are more pages
    if (response.results.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }
  }

  console.log(
    `[sync] Sales sync complete: ${result.inserted} inserted, ${result.skipped} skipped, ${result.errors} errors`,
  );
  return result;
}
