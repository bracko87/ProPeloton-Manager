create or replace function public.equipment_ai_inventory_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_ai boolean := false;
  v_is_starter boolean := false;
  v_bypass boolean := coalesce(current_setting('equipment.ai_policy_job', true), '') = '1';
begin
  if tg_op = 'DELETE' then
    select coalesce(c.is_ai, false)
    into v_is_ai
    from public.clubs c
    where c.id = old.club_id;

    if v_is_ai and not v_bypass then
      raise exception 'AI club equipment cannot be deleted';
    end if;

    return old;
  end if;

  select coalesce(c.is_ai, false)
  into v_is_ai
  from public.clubs c
  where c.id = new.club_id;

  if not v_is_ai then
    return new;
  end if;

  if not v_bypass then
    select exists (
      select 1
      from public.equipment_get_starter_equipment_catalog() s
      where s.catalog_item_id = new.catalog_item_id
    )
    into v_is_starter;

    if not v_is_starter then
      raise exception 'AI clubs can only have starter equipment';
    end if;

    if tg_op = 'INSERT'
      and coalesce(new.metadata->>'starter_equipment', 'false') <> 'true' then
      raise exception 'AI clubs cannot buy or receive market equipment';
    end if;

    if new.status in ('sold', 'discarded') then
      raise exception 'AI club equipment cannot be sold or discarded';
    end if;
  end if;

  if new.condition_percent is null or new.condition_percent <= 50 then
    new.condition_percent := 100;
    new.metadata = coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'ai_auto_repaired', true,
        'ai_auto_repaired_at', now(),
        'ai_auto_repair_reason', 'AI equipment condition reached 50 or lower',
        'ai_auto_repair_cost_cash', 0
      );
  end if;

  new.metadata = coalesce(new.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'ai_equipment', true,
      'ai_locked_starter_equipment', true,
      'ai_no_sale', true,
      'ai_no_maintenance_cost', true,
      'no_resale_value', true
    );

  return new;
end;
$function$;
