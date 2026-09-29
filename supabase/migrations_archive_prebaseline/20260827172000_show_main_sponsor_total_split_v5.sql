-- Show the V5 total-contract arithmetic directly in the existing sponsor-offer
-- description line, without adding another large UI card.

create or replace function public.sponsor_offer_economic_description_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_company_description text;
  v_summary text;
  v_total bigint;
begin
  if coalesce(new.sponsor_kind, '') <> 'main'
     or coalesce(new.status, '') <> 'offered'
     or coalesce(new.metadata->>'economic_model_version', '') <> 'v5_one_total_split'
  then
    return new;
  end if;

  v_total := greatest(0, coalesce(new.guaranteed_amount, 0))
           + greatest(0, coalesce(new.bonus_pool_amount, 0));

  v_company_description := nullif(new.metadata->>'company_description', '');

  if v_company_description is null
     and nullif(new.metadata->>'description', '') is not null
     and new.metadata->>'description' not like 'Total contract value:%'
  then
    v_company_description := new.metadata->>'description';
  end if;

  v_summary :=
    'Total contract value: ' || to_char(v_total, 'FM999,999,999') ||
    '. Guaranteed: ' || to_char(greatest(0, coalesce(new.guaranteed_amount, 0)), 'FM999,999,999') ||
    '. Bonus pool: ' || to_char(greatest(0, coalesce(new.bonus_pool_amount, 0)), 'FM999,999,999') || '.';

  new.metadata := coalesce(new.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'economic_summary', v_summary,
      'description',
        case
          when v_company_description is null then v_summary
          else v_company_description || ' ' || v_summary
        end
    );

  if v_company_description is not null then
    new.metadata := new.metadata || jsonb_build_object(
      'company_description', v_company_description
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_zz_sponsor_offer_economic_description_v1
on public.club_sponsor_offers;

create trigger trg_zz_sponsor_offer_economic_description_v1
before insert or update of guaranteed_amount, bonus_pool_amount, metadata, sponsor_kind, status
on public.club_sponsor_offers
for each row
execute function public.sponsor_offer_economic_description_v1();

update public.club_sponsor_offers o
set metadata = coalesce(o.metadata, '{}'::jsonb)
where o.status = 'offered'
  and o.sponsor_kind = 'main'
  and coalesce(o.metadata->>'economic_model_version', '') = 'v5_one_total_split';
