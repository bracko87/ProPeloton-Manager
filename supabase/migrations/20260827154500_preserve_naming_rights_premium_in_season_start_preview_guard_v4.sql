-- Preserve the naming-rights premium while protecting fresh-season offers from proration drift.
-- Standard offers still resolve to their full-season base at the January season start.

create or replace function public.sponsor_keep_test_season_start_preview_offer_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uplift numeric := 0;
  v_base_guaranteed bigint;
  v_base_bonus bigint;
begin
  if tg_op = 'UPDATE'
     and coalesce(old.metadata ->> 'test_new_season_start_preview', '') = 'true'
     and coalesce(new.status, 'offered') = 'offered'
  then
    new.generated_game_month := 1;
    new.coverage_months := 12;
    new.proration_factor := 1;

    v_base_guaranteed := greatest(
      0,
      coalesce(new.full_season_guaranteed_amount, new.guaranteed_amount, 0)
    );
    v_base_bonus := greatest(
      0,
      coalesce(new.full_season_bonus_pool_amount, new.bonus_pool_amount, 0)
    );

    if coalesce(new.main_sponsor_deal_type, 'standard') = 'naming_rights' then
      v_uplift := greatest(
        30,
        least(
          40,
          coalesce(
            new.naming_rights_uplift_pct,
            nullif(new.metadata ->> 'naming_rights_uplift_pct', '')::numeric,
            30
          )
        )
      );
    else
      v_uplift := 0;
    end if;

    new.guaranteed_amount := floor(
      v_base_guaranteed::numeric * (1 + v_uplift / 100.0)
    )::bigint;
    new.bonus_pool_amount := floor(
      v_base_bonus::numeric * (1 + v_uplift / 100.0)
    )::bigint;
    new.monthly_amount := floor(new.guaranteed_amount::numeric / 12)::bigint;

    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'test_new_season_start_preview', true,
        'test_preview_generated_game_month', 1,
        'test_preview_coverage_months', 12,
        'test_preview_proration_factor', 1,
        'test_preview_refresh_protected', true,
        'test_preview_refresh_protected_at', now(),
        'test_preview_naming_rights_uplift_preserved', v_uplift,
        'test_preview_naming_rights_policy_version', 'v4_30_40'
      );
  end if;

  return new;
end;
$function$;
