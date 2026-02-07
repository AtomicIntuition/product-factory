-- Create public storage bucket for product files (PDFs + thumbnails)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-files', 'product-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to product files
CREATE POLICY "Public read access" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-files');

-- Allow service role to upload files
CREATE POLICY "Service role upload" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'product-files');

-- Allow service role to update files (upsert)
CREATE POLICY "Service role update" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'product-files');

-- Add thumbnail_url column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS thumbnail_url text;
