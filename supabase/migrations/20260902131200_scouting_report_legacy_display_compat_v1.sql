create or replace function public.build_scout_metric_json(p_exact numeric, p_precision_tier text)
returns jsonb
language plpgsql
immutable
as $function$
declare
  v_step integer;
  v_exact integer;
  v_bucket_index integer;
  v_bucket_count integer;
  v_lower integer;
  v_upper integer;
  v_label text;
  v_legacy_display_value integer;
  v_tier text := lower(trim(coalesce(p_precision_tier, 'basic')));
begin
  if p_exact is null then
    return jsonb_build_object(
      'label', null,
      'exact', null,
      'exact_revealed', false,
      'precision_tier', v_tier
    );
  end if;

  v_exact := greatest(0, least(100, round(p_exact)::integer));
  v_step := public.scout_metric_bucket_step(v_tier);

  if v_step <= 1 then
    v_label := v_exact::text;
    v_legacy_display_value := v_exact;
  else
    v_bucket_count := 100 / v_step;
    v_bucket_index := least(floor(v_exact::numeric / v_step)::integer, v_bucket_count - 1);
    v_lower := v_bucket_index * v_step;
    v_upper := least(100, v_lower + v_step);
    v_label := format('%s-%s', v_lower, v_upper);
    v_legacy_display_value := round((v_lower + v_upper) / 2.0)::integer;
  end if;

  return jsonb_build_object(
    'label', v_label,
    -- Legacy UI compatibility: lower-quality reports receive only a range-derived
    -- midpoint here, never the rider's true hidden value. Elite reports may reveal exact.
    'exact', case when v_tier = 'elite' then v_exact else v_legacy_display_value end,
    'exact_revealed', (v_tier = 'elite'),
    'precision_tier', v_tier
  );
end;
$function$;