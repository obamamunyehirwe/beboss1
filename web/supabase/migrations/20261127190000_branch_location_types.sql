-- First-class location classification for retail stores and stock warehouses.
-- Existing branch rows are preserved and classified as STORE by default.
ALTER TABLE public.shop_branches
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'STORE';

UPDATE public.shop_branches
SET location_type = 'STORE'
WHERE location_type IS NULL OR btrim(location_type) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.shop_branches'::regclass
      AND conname = 'shop_branches_location_type_check'
  ) THEN
    ALTER TABLE public.shop_branches
      ADD CONSTRAINT shop_branches_location_type_check
      CHECK (location_type IN ('STORE', 'WAREHOUSE')
        AND (location_type <> 'WAREHOUSE' OR is_main_branch = false));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shop_branches_location_active
  ON public.shop_branches (shop_sync_key, location_type, is_active);

COMMENT ON COLUMN public.shop_branches.location_type IS
  'STORE for customer-facing retail/POS locations; WAREHOUSE for stock-holding locations. Legacy rows default to STORE.';
