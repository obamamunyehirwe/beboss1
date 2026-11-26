-- Low-latency shop-change notifications for authenticated owner devices.
-- Broadcast only table/operation/version metadata; clients must fetch the signed,
-- tenant-scoped snapshot over the existing authenticated API before applying data.
--
-- Private channel topic: shop:<shop_sync_key>
-- Authorization is checked once on channel join and refreshed with the owner's JWT.

CREATE POLICY "BeBoss active shop owners receive private shop change broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'broadcast'
  AND realtime.topic() LIKE 'shop:%'
  AND EXISTS (
    SELECT 1
    FROM public.shop_owner_memberships AS membership
    WHERE membership.user_id = (SELECT auth.uid())
      AND membership.shop_id = substr(realtime.topic(), 6)
      AND membership.status = 'ACTIVE'
      AND membership.revoked_at = 0
  )
);

CREATE OR REPLACE FUNCTION public.broadcast_beboss_shop_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  changed_row jsonb;
  shop_key text;
BEGIN
  changed_row := CASE
    WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
    ELSE to_jsonb(NEW)
  END;

  IF TG_TABLE_NAME = 'shop_accounts' THEN
    shop_key := COALESCE(NULLIF(changed_row ->> 'id', ''), '');
  ELSE
    shop_key := COALESCE(NULLIF(changed_row ->> 'shop_sync_key', ''), '');
  END IF;

  IF shop_key = '' THEN
    RETURN NULL;
  END IF;

  -- Never broadcast row contents, personal data, tokens, balances or credentials.
  PERFORM realtime.send(
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'updatedAt', COALESCE(changed_row ->> 'updated_at', ''),
      'deviceId', COALESCE(changed_row ->> 'device_id', '')
    ),
    'shop-data-changed',
    'shop:' || shop_key,
    true
  );

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.broadcast_beboss_shop_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broadcast_beboss_shop_change() FROM anon;
REVOKE ALL ON FUNCTION public.broadcast_beboss_shop_change() FROM authenticated;

COMMENT ON FUNCTION public.broadcast_beboss_shop_change() IS
  'Emits private metadata-only Supabase Realtime notifications for shop changes. Business records are fetched separately through authenticated tenant-scoped APIs.';

DROP TRIGGER IF EXISTS trg_beboss_realtime_branch_sync_snapshots ON public.branch_sync_snapshots;
CREATE TRIGGER trg_beboss_realtime_branch_sync_snapshots
AFTER INSERT OR UPDATE OR DELETE ON public.branch_sync_snapshots
FOR EACH ROW EXECUTE FUNCTION public.broadcast_beboss_shop_change();

DROP TRIGGER IF EXISTS trg_beboss_realtime_shop_accounts ON public.shop_accounts;
CREATE TRIGGER trg_beboss_realtime_shop_accounts
AFTER INSERT OR UPDATE OR DELETE ON public.shop_accounts
FOR EACH ROW EXECUTE FUNCTION public.broadcast_beboss_shop_change();

DROP TRIGGER IF EXISTS trg_beboss_realtime_shop_devices ON public.shop_devices;
CREATE TRIGGER trg_beboss_realtime_shop_devices
AFTER INSERT OR UPDATE OR DELETE ON public.shop_devices
FOR EACH ROW EXECUTE FUNCTION public.broadcast_beboss_shop_change();

DROP TRIGGER IF EXISTS trg_beboss_realtime_shop_branches ON public.shop_branches;
CREATE TRIGGER trg_beboss_realtime_shop_branches
AFTER INSERT OR UPDATE OR DELETE ON public.shop_branches
FOR EACH ROW EXECUTE FUNCTION public.broadcast_beboss_shop_change();

DROP TRIGGER IF EXISTS trg_beboss_realtime_shop_users ON public.shop_users;
CREATE TRIGGER trg_beboss_realtime_shop_users
AFTER INSERT OR UPDATE OR DELETE ON public.shop_users
FOR EACH ROW EXECUTE FUNCTION public.broadcast_beboss_shop_change();

DROP TRIGGER IF EXISTS trg_beboss_realtime_shop_stock_transfers ON public.shop_stock_transfers;
CREATE TRIGGER trg_beboss_realtime_shop_stock_transfers
AFTER INSERT OR UPDATE OR DELETE ON public.shop_stock_transfers
FOR EACH ROW EXECUTE FUNCTION public.broadcast_beboss_shop_change();
