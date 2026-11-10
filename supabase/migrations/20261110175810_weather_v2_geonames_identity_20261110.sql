-- Historical weather V2: retain GeoNames identity and US state/other admin subdivision.
-- Metadata only: no route/cancellation/engine changes.
alter table private.weather_v2_locations
  add column if not exists geonames_id bigint,
  add column if not exists admin1_code text,
  add column if not exists geocode_review_note text;

create unique index if not exists weather_v2_locations_geonames_id_unique
  on private.weather_v2_locations (geonames_id)
  where geonames_id is not null;

-- A name+country pair is NOT guaranteed to identify one city (Miami, FL vs TX).
-- Existing name-key rows are placeholders; a fully general duplicate-city alias
-- model is required before mass geocoding and engine activation.
