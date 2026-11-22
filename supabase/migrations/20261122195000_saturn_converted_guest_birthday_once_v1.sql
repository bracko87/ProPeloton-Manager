-- Converted guest accounts that skipped optional birth date can provide it exactly once.
-- Other accounts continue through the existing regular registration process.
-- Existing validate_profile_birthday_v1 trigger prevents any subsequent date edits.
create or replace function public.saturn_set_missing_birthday_once_v1(
  p_month integer, p_day integer, p_year integer default null
) returns jsonb
language plpgsql security invoker set search_path=''
as $body$
declare
  v_uid uuid := auth.uid();
  v_p record;
  v_date date;
begin
  if v_uid is null
    or not exists (
      select 1 from public.saturn_test_accounts_v1 t
      join auth.users u on u.id=t.user_id
      where t.user_id=v_uid and t.converted_at is not null
        and u.is_anonymous is false
    )
  then
    raise exception 'This birthday option is only available after converting an existing guest team.'
      using errcode='42501';
  end if;
  if p_month is null or p_day is null or p_month not between 1 and 12 or p_day not between 1 and 31
    or (p_year is not null and (p_year < 1900 or p_year > extract(year from current_date)::integer)) then
    raise exception 'Enter a valid birthday month, day and optional year.' using errcode='22023';
  end if;
  -- Make-date enforces calendar validity and allows 29 February without a year.
  v_date:=make_date(coalesce(p_year,2000),p_month,p_day);
  if p_year is not null and v_date>current_date then
    raise exception 'Birthday cannot be in the future.' using errcode='22023';
  end if;

  select id,birthday_month,birthday_day,birthday_year,birthday,birthday_locked,birthday_set_at
    into v_p from public.profiles where id=v_uid for update;
  if not found then raise exception 'Your profile was not found.' using errcode='42501'; end if;
  if v_p.birthday_locked is true or v_p.birthday_month is not null
    or v_p.birthday_day is not null or v_p.birthday_year is not null
    or v_p.birthday is not null or v_p.birthday_set_at is not null then
    raise exception 'Birthday was already saved and cannot be changed.' using errcode='42501';
  end if;
  update public.profiles set birthday_month=p_month,birthday_day=p_day,birthday_year=p_year,
    birthday=case when p_year is not null then v_date else null end,
    birthday_locked=true,birthday_set_at=now()
  where id=v_uid and birthday_locked is false and birthday_month is null and birthday_day is null
    and birthday_year is null and birthday is null and birthday_set_at is null;
  if not found then raise exception 'Birthday was already saved.' using errcode='42501'; end if;
  return jsonb_build_object('saved',true,'birthday_month',p_month,'birthday_day',p_day,
    'birthday_year',p_year,'locked',true);
end;
$body$;

revoke all on function public.saturn_set_missing_birthday_once_v1(integer,integer,integer) from public,anon,authenticated;
grant execute on function public.saturn_set_missing_birthday_once_v1(integer,integer,integer) to authenticated;
