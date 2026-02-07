import { NextRequest, NextResponse } from "next/server";
import { getProducts, insertSale } from "@/lib/supabase/queries";
import { getEnv } from "@/config/env";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const seller_id = formData.get("seller_id") as string | null;
    const product_id = formData.get("product_id") as string | null;
    const sale_id = formData.get("sale_id") as string | null;
    const price = formData.get("price") as string | null;
    const email = formData.get("email") as string | null;
    const sale_timestamp = formData.get("sale_timestamp") as string | null;

    if (!seller_id || !product_id || !sale_id || !price || !email || !sale_timestamp) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const env = getEnv();
    if (seller_id !== env.GUMROAD_SELLER_ID) {
      return NextResponse.json(
        { error: "Invalid seller_id" },
        { status: 403 },
      );
    }

    const products = await getProducts();
    const product = products.find((p) => p.gumroad_id === product_id);

    if (!product) {
      return NextResponse.json(
        { error: "Product not found for the given gumroad_id" },
        { status: 404 },
      );
    }

    const amountCents = Math.round(parseFloat(price.replace(/[^0-9.]/g, "")) * 100);

    const sale = await insertSale({
      product_id: product.id,
      gumroad_sale_id: sale_id,
      amount_cents: amountCents,
      currency: "usd",
      buyer_email: email,
      sale_timestamp,
    });

    return NextResponse.json(sale, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
