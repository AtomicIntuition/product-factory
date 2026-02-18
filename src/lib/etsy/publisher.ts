import { etsy } from "@/lib/etsy/client";
import { getProductById, updateProduct } from "@/lib/supabase/queries";
import { getEnv } from "@/config/env";

const FETCH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function publishToEtsy(productId: string): Promise<{ listingId: number; url: string }> {
  const env = getEnv();
  const shopId = env.ETSY_SHOP_ID;
  const product = await getProductById(productId);
  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  // Append AI disclosure to description if not already present
  let description = product.description;
  if (!description.includes("AI assistance") && !description.includes("AI tools")) {
    description += "\n\n---\nDesigned with AI assistance. Template structure and formulas created using AI tools.";
  }

  // Step 1: Create draft listing
  console.log(`[publisher] Step 1: Creating draft listing for "${product.title}"...`);
  let listing;
  try {
    listing = await etsy.createDraftListing(shopId, {
      title: product.title,
      description,
      price: product.price_cents / 100,
      quantity: 999,
      taxonomy_id: product.taxonomy_id ?? 2078,
      tags: product.tags.slice(0, 13),
      who_made: "i_did",
      when_made: "made_to_order",
      is_digital: true,
      type: "download",
      is_supply: false,
    });
    console.log(`[publisher] Draft listing created: ${listing.listing_id}`);
  } catch (error) {
    await updateProduct(productId, { status: "publish_failed" });
    throw new Error(`Step 1 (create draft) failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const listingId = listing.listing_id;

  // Step 2: Upload listing images
  console.log(`[publisher] Step 2: Uploading ${product.image_urls.length} listing images...`);
  try {
    let successfulUploads = 0;
    for (let i = 0; i < product.image_urls.length; i++) {
      const imageUrl = product.image_urls[i];
      const imageRes = await fetchWithTimeout(imageUrl);
      if (!imageRes.ok) {
        console.error(`[publisher] Failed to download image ${i + 1}: ${imageRes.status}`);
        continue;
      }
      const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
      await etsy.uploadListingImage(shopId, listingId, imageBuffer, i + 1);
      successfulUploads++;
      console.log(`[publisher] Image ${i + 1} uploaded`);
    }
    if (successfulUploads === 0 && product.image_urls.length > 0) {
      throw new Error("All image uploads failed — Etsy requires at least 1 listing image");
    }
  } catch (error) {
    await updateProduct(productId, { status: "publish_failed" });
    throw new Error(`Step 2 (upload images) failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 3: Upload digital file (.xlsx)
  console.log(`[publisher] Step 3: Uploading spreadsheet file...`);
  try {
    if (!product.content_file_url) {
      throw new Error("No .xlsx file URL found on product");
    }
    const fileRes = await fetchWithTimeout(product.content_file_url);
    if (!fileRes.ok) {
      throw new Error(`Failed to download .xlsx: ${fileRes.status}`);
    }
    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
    const slug = product.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    await etsy.uploadListingFile(shopId, listingId, fileBuffer, `${slug}.xlsx`);
    console.log(`[publisher] Spreadsheet file uploaded`);
  } catch (error) {
    await updateProduct(productId, { status: "publish_failed" });
    throw new Error(`Step 3 (upload file) failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 4: Activate listing
  console.log(`[publisher] Step 4: Activating listing...`);
  try {
    const activated = await etsy.updateListing(shopId, listingId, { state: "active" });
    const url = activated.url || `https://www.etsy.com/listing/${listingId}`;
    console.log(`[publisher] Listing activated: ${url}`);

    // Update product with Etsy data
    await updateProduct(productId, {
      etsy_listing_id: listingId,
      etsy_url: url,
      status: "published",
    });

    return { listingId, url };
  } catch (error) {
    await updateProduct(productId, { status: "publish_failed" });
    throw new Error(`Step 4 (activate) failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
