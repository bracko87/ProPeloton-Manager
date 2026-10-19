-- Allow formally awarded National Association championship medals to appear
-- in the same read-only career honours history as national and world medals.
-- No association medal is fabricated here: awards are inserted only by a
-- verified competition results process when available.
alter table public.rider_championship_honours
  drop constraint if exists rider_championship_honours_honor_type_check;

alter table public.rider_championship_honours
  add constraint rider_championship_honours_honor_type_check
  check (honor_type in ('national_road','world_road','national_association'));
