-- SATURN schema baseline parity inventory (read only, no data or secrets).
-- Run on production for metadata and on isolated restored baseline BEFORE
-- Saturn changes. Compare per-schema counts and catalog fingerprints; exact
-- equality requires matching PostgreSQL version and normalized search_path.
-- Not a substitute for native pg_dump/pg_restore or actual gameplay tests.
with app(nsp) as (
 values ('public'),('private'),('finance'),('archive'),('control_center_private'),('v4_historical_research')
), objects as (
 select n.nspname as schema_name,
   case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table' when 'v' then 'view' when 'm' then 'materialized_view' when 'S' then 'sequence' else 'foreign_table' end as kind,
   c.relname::text as object_name,
   concat_ws('|',c.relkind::text,pg_get_userbyid(c.relowner),coalesce(c.relacl::text,''),c.relrowsecurity::text,c.relforcerowsecurity::text,coalesce(c.reloptions::text,'')) as signature
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in (select nsp from app) and c.relkind in ('r','p','v','m','S','f')
 union all
 select n.nspname,'routine',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
   concat_ws('|',pg_get_userbyid(p.proowner),p.prosecdef::text,coalesce(p.proacl::text,''),md5(pg_get_functiondef(p.oid)))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in(select nsp from app) and p.prokind in ('f','p','w')
 union all
 select n.nspname,'constraint',c.relname||'.'||con.conname,pg_get_constraintdef(con.oid,true)
 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in (select nsp from app)
 union all
 select n.nspname,'trigger',c.relname||'.'||t.tgname,concat_ws('|',t.tgenabled::text,pg_get_triggerdef(t.oid,true))
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
 where not t.tgisinternal and (n.nspname in(select nsp from app) or (n.nspname in('auth','storage','realtime') and pn.nspname in(select nsp from app)))
 union all
 select n.nspname,'policy',c.relname||'.'||pl.polname,
   concat_ws('|',pl.polcmd::text,pl.polpermissive::text,
      (select string_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end,',' order by case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end) from unnest(pl.polroles) r),
      coalesce(pg_get_expr(pl.polqual,pl.polrelid,true),''),coalesce(pg_get_expr(pl.polwithcheck,pl.polrelid,true),''))
 from pg_policy pl join pg_class c on c.oid=pl.polrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in(select nsp from app) or n.nspname in ('auth','storage')
)
select schema_name,kind,count(*)::integer as objects,md5(string_agg(object_name||'|'||md5(signature),E'\n' order by object_name)) as fingerprint
from objects group by schema_name,kind order by schema_name,kind;

-- Managed extensions: version and schema parity, never export vault data.
select e.extname,n.nspname as installed_schema,e.extversion
from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by e.extname;
