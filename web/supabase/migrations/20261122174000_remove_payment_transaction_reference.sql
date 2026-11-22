-- Remove transaction-reference collection from new BeBoss payment flows.
-- The sync audit trigger no longer reads the legacy field before the column is dropped.
create or replace function public.log_cloud_sync_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text := '';
  v_shop text := '';
  v_entity text := '';
  v_action text := '';
  v_device text := '';
  v_detail text := '';
  v_material boolean := true;
  v_actor text;
  r record;
begin
  begin
    if tg_op = 'DELETE' then r := old; else r := new; end if;
    v_actor := case
      when public.is_beboss_admin() then 'ADMIN'
      when public.current_shop_sync_key() <> '' then 'APP'
      else 'SYSTEM' end;

    if tg_table_name = 'shop_accounts' then
      v_key := r.id; v_shop := r.shop_name; v_entity := 'SHOP';
      if tg_op = 'INSERT' then v_action := 'REGISTERED'; v_detail := r.subscription_status || ' • ' || r.branch_count || ' branch(es)';
      elsif tg_op = 'DELETE' then v_action := 'DELETED';
      else
        v_material := (old.subscription_status is distinct from new.subscription_status)
          or (old.subscription_expires_at is distinct from new.subscription_expires_at)
          or (old.branch_count is distinct from new.branch_count)
          or (old.worker_count is distinct from new.worker_count)
          or (old.device_count is distinct from new.device_count)
          or (old.remote_kill_switch is distinct from new.remote_kill_switch);
        if old.subscription_status is distinct from new.subscription_status then
          v_action := 'STATUS_CHANGED'; v_detail := old.subscription_status || ' → ' || new.subscription_status;
        elsif old.subscription_expires_at is distinct from new.subscription_expires_at then
          v_action := 'LICENSE_EXTENDED'; v_detail := 'Expiry moved to ' || to_char(to_timestamp(new.subscription_expires_at / 1000.0), 'YYYY-MM-DD HH24:MI');
        elsif old.remote_kill_switch is distinct from new.remote_kill_switch then
          v_action := case when new.remote_kill_switch then 'KILL_SWITCH_ON' else 'KILL_SWITCH_OFF' end;
        elsif v_material then
          v_action := 'LIMITS_CHANGED'; v_detail := new.branch_count || ' branches • ' || new.worker_count || ' staff • ' || new.device_count || ' devices';
        else
          v_action := 'HEARTBEAT';
        end if;
      end if;

    elsif tg_table_name = 'shop_devices' then
      v_key := r.shop_sync_key; v_shop := r.shop_name; v_entity := 'DEVICE'; v_device := r.device_id;
      if tg_op = 'INSERT' then v_action := 'PAIRED'; v_detail := r.device_name || ' • ' || r.role || ' • ' || r.branch_name;
      elsif tg_op = 'DELETE' then v_action := 'REMOVED'; v_detail := r.device_name;
      else
        v_material := (old.is_active is distinct from new.is_active) or (old.branch_id is distinct from new.branch_id) or (old.assigned_username is distinct from new.assigned_username);
        if old.is_active is distinct from new.is_active then
          v_action := case when new.is_active then 'ACTIVATED' else 'DEACTIVATED' end; v_detail := new.device_name;
        elsif v_material then
          v_action := 'REASSIGNED'; v_detail := new.device_name || ' → @' || new.assigned_username || ' • ' || new.branch_name;
        else
          v_action := 'SYNCED'; v_detail := new.device_name;
        end if;
      end if;

    elsif tg_table_name = 'shop_users' then
      v_key := r.shop_sync_key; v_shop := r.shop_name; v_entity := 'STAFF';
      if tg_op = 'INSERT' then v_action := 'ADDED'; v_detail := r.full_name || ' (@' || r.username || ') • ' || r.role;
      elsif tg_op = 'DELETE' then v_action := 'REMOVED'; v_detail := r.full_name;
      else
        if (old.is_active is not distinct from new.is_active) and (old.role is not distinct from new.role) and (old.assigned_branch_id is not distinct from new.assigned_branch_id) then
          return null;
        end if;
        v_action := 'CHANGED'; v_detail := new.full_name || ' • ' || new.role || case when new.is_active then '' else ' • disabled' end;
      end if;

    elsif tg_table_name = 'branch_sync_snapshots' then
      v_key := r.shop_sync_key; v_shop := r.shop_name; v_entity := 'SNAPSHOT'; v_device := r.device_id;
      if tg_op = 'DELETE' then v_action := 'PRUNED'; v_detail := r.branch_name;
      else
        v_action := 'UPLOADED'; v_detail := r.branch_name || case when r.records_summary <> '' then ' • ' || r.records_summary else '' end;
        v_material := tg_op = 'INSERT' or (old.records_summary is distinct from new.records_summary);
      end if;

    elsif tg_table_name = 'payment_requests' then
      v_key := public.computed_shop_sync_key(r.owner_username, r.owner_phone); v_shop := r.shop_name; v_entity := 'PAYMENT';
      if tg_op = 'INSERT' then
        v_action := 'SUBMITTED'; v_detail := r.provider || ' • ' || r.amount_rwf || ' FRw';
        if r.source = 'WEB' and v_actor = 'APP' then v_actor := 'WEB'; end if;
      elsif tg_op = 'DELETE' then v_action := 'DELETED';
      else
        if old.status is not distinct from new.status then return null; end if;
        v_action := new.status; v_detail := new.amount_rwf || ' FRw' || case when new.rejection_reason <> '' then ' • ' || new.rejection_reason else '' end;
      end if;

    elsif tg_table_name = 'unlock_codes' then
      v_key := public.computed_shop_sync_key(r.shop_username, r.shop_phone); v_entity := 'UNLOCK_CODE';
      select shop_name into v_shop from public.shop_accounts where id = v_key;
      v_shop := coalesce(v_shop, '');
      if tg_op = 'INSERT' then v_action := 'ISSUED'; v_detail := r.tier_code || ' • +' || r.plan_days || ' days';
      elsif tg_op = 'DELETE' then v_action := 'DELETED';
      else
        if old.status is not distinct from new.status then return null; end if;
        v_action := new.status; v_detail := new.tier_code || ' • +' || r.plan_days || ' days';
      end if;
    else
      return null;
    end if;

    if not v_material and exists (
      select 1 from public.cloud_sync_events e
      where e.shop_sync_key = v_key and e.entity = v_entity and e.device_id = v_device
        and e.created_at > now() - interval '10 minutes'
    ) then
      return null;
    end if;

    insert into public.cloud_sync_events (shop_sync_key, shop_name, entity, action, actor, device_id, detail)
    values (coalesce(v_key, ''), coalesce(v_shop, ''), v_entity, v_action, v_actor, coalesce(v_device, ''), left(coalesce(v_detail, ''), 500));

    return null;
  exception when others then
    return null;
  end;
end;
$function$;

drop index if exists public.payment_requests_provider_reference_uidx;
alter table public.payment_requests drop column if exists telco_reference;

comment on table public.payment_requests is
  'Subscription payment claims contain payer identity, provider, time, note and exact plan pricing. They do not use transaction-reference fields.';