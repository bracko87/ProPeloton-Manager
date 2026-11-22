-- Automatic self-contained shield for new human-owned main clubs with no custom logo.
-- No remote image generation, object storage writes, or user-provided SVG markup.
create or replace function private.ppm_assign_default_club_shield_v1()
returns trigger language plpgsql security invoker set search_path = '' as $shield$
begin
  if new.is_ai is false and new.club_type='main' and new.owner_user_id is not null and nullif(btrim(new.logo_path),'') is null then
    new.logo_path := 'data:image/svg+xml;base64,' || replace(encode(convert_to(format('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72"><path fill="%s" d="M5 5H59V34C59 49 49 61 32 68C15 61 5 49 5 34Z"/><path fill="%s" d="M32 5H59V34C59 49 49 61 32 68Z"/><path fill="none" stroke="#fff" stroke-width="2" d="M8 8H56V34C56 47 47 58 32 65C17 58 8 47 8 34Z"/><path fill="none" stroke="#334155" stroke-width="2" d="M5 5H59V34C59 49 49 61 32 68C15 61 5 49 5 34Z"/></svg>',case when new.primary_color ~ '^#[0-9A-Fa-f]{6}$' then upper(new.primary_color) else '#FFC400' end,case when new.secondary_color ~ '^#[0-9A-Fa-f]{6}$' then upper(new.secondary_color) else '#111827' end),'UTF8'),'base64'),E'\n','');
  end if;
  return new;
end;
$shield$;
revoke all on function private.ppm_assign_default_club_shield_v1() from public, anon, authenticated;
create trigger ppm_assign_default_club_shield_v1 before insert on public.clubs
for each row execute function private.ppm_assign_default_club_shield_v1();

-- Backfill existing Saturn guest teams only (never replace existing logos).
update public.clubs c set logo_path='data:image/svg+xml;base64,' || replace(encode(convert_to(format('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72"><path fill="%s" d="M5 5H59V34C59 49 49 61 32 68C15 61 5 49 5 34Z"/><path fill="%s" d="M32 5H59V34C59 49 49 61 32 68Z"/><path fill="none" stroke="#fff" stroke-width="2" d="M8 8H56V34C56 47 47 58 32 65C17 58 8 47 8 34Z"/><path fill="none" stroke="#334155" stroke-width="2" d="M5 5H59V34C59 49 49 61 32 68C15 61 5 49 5 34Z"/></svg>',case when c.primary_color ~ '^#[0-9A-Fa-f]{6}$' then upper(c.primary_color) else '#FFC400' end,case when c.secondary_color ~ '^#[0-9A-Fa-f]{6}$' then upper(c.secondary_color) else '#111827' end),'UTF8'),'base64'),E'\n','')
where c.is_ai is false and c.club_type='main' and c.deleted_at is null
  and nullif(btrim(c.logo_path),'') is null
  and exists(select 1 from public.saturn_test_accounts_v1 t where t.club_id=c.id and t.user_id=c.owner_user_id);

-- Assert that any current active guest team now has a logo.
do $check$ begin
if exists(select 1 from public.saturn_test_accounts_v1 t join public.clubs c on c.id=t.club_id where c.deleted_at is null and c.is_ai is false and c.club_type='main' and nullif(btrim(c.logo_path),'') is null) then raise exception 'Guest logo backfill incomplete'; end if;
end $check$;