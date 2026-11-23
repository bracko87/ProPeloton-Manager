-- Tour of Tutuila uses the authoritative American Samoa territory code AS.
-- Existing ProPeloton Manager production countries catalog confirms:
-- code AS / American Samoa / selectable true.
-- Fresh baselines must provide the FK parent before the race seed.
insert into public.countries(code,name,is_selectable)
values ('AS','American Samoa',true)
on conflict(code) do nothing;
