
create or replace function public.generate_referral_code(len integer)
returns text
language sql
volatile
as $$ select substr(md5(random()::text),1,greatest(len,1)) $$;

create or replace function public.get_current_game_date_date()
returns date
language sql
stable
as $$ select current_date $$;

create or replace function public.get_market_game_date()
returns date
language sql
stable
security definer
set search_path = ''
as $$ select current_date $$;
