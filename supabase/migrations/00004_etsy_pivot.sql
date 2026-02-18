-- Pivot from Gumroad to Etsy

-- Products: swap Gumroad fields for Etsy fields
ALTER TABLE products DROP COLUMN IF EXISTS gumroad_id;
ALTER TABLE products DROP COLUMN IF EXISTS gumroad_url;
ALTER TABLE products ADD COLUMN IF NOT EXISTS etsy_listing_id bigint;
ALTER TABLE products ADD COLUMN IF NOT EXISTS etsy_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS taxonomy_id integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';

-- Sales: swap Gumroad sale ID for Etsy receipt ID
ALTER TABLE sales DROP COLUMN IF EXISTS gumroad_sale_id;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS etsy_receipt_id text;

-- Etsy OAuth token storage
CREATE TABLE IF NOT EXISTS etsy_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scopes text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
