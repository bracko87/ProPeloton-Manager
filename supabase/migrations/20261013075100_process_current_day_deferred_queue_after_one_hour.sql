-- Allow deferred same-day work once game time reaches 01:00.
-- Without this, the historical backlog consumer perpetually trails the
-- game clock by one entire game day, even when fully caught up.
do $patch$
declare
 v_sql text;
 v_before text :=
   'if v_oldest is null or v_oldest >= v_today then';
 v_after text :=
   'if v_oldest is null or v_oldest > v_today or (v_oldest = v_today and (select hour_number from public.game_state where id=true) < 1) then';
begin
 select pg_get_functiondef('private.recover_game_daily_backlog_safe_v1()'::regprocedure)
 into v_sql;
 if position(v_before in v_sql)>0 then
   execute replace(v_sql,v_before,v_after);
 elsif position(v_after in v_sql)=0 then
   raise exception 'Unexpected daily backlog recovery definition';
 end if;
end
$patch$;