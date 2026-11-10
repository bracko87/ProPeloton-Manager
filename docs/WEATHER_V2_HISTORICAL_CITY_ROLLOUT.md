# Historical city-based stage weather V2 — controlled rollout

**State (2026-11-10): research database installed; NOT activated in race engine or weather cancellations.**
Game production source: `main`. Related issue: #255. Core/weather discrepancy: #254.

## Verified starting state

- 3,895 stage records, of which 126 have no `stage_date`.
- 2,103 normalized location/country names seeded from stage start, finish and optional host names. **Zero are verified/geocoded yet.** Country is initially inferred from the containing race; cross-border stages must be reviewed.
- 3,769 dated stage research candidates linked to start and finish name records. None approved.
- Five research-only tables in `private`, all RLS-enabled, with no `anon`/`authenticated` select grants.
- **No new historical observations imported**, no changes to `race_stages.weather_snapshot`, no old cancellations/replays/simulation results rewritten.

## Implemented schema

1. `private.weather_v2_locations`: city aliases, country, verified latitude/longitude/elevation, IANA time zone, geocoding evidence/status. An inferred country or an unverified coordinate is never authoritative.
2. `private.weather_v2_season_reference_year`: global, deterministic historical-year mapping, fixed for first ten seasons.
3. `private.weather_v2_hourly_archive`: hourly archive with UTC key (handles repeated hours on daylight-saving transitions), local date/hour, temperature, humidity, precipitation/snow, wind and weather code, source and licence.
4. `private.weather_v2_daily_archive`: historical daily minimum/maximum/mean and precipitation, with source and licence.
5. `private.weather_v2_stage_candidate`: proposed per-stage start/finish weather, research status and evidence. **No production table reads it.**

`private.weather_v2_reference_date(stage_date)` maps game year 2000 -> Season 1 -> historical 2025, 2001 -> Season 2 -> historical 2020. A game date of Feb 29 maps to Feb 28 if the historical reference year is not leap, labelled `feb29_mapped_to_feb28`. Do not allow this convention to masquerade as an observed Feb 29.

Historical-year plan:
| Season | Historical year |
|---:|---:|
|1|2025|
|2|2020|
|3|2023|
|4|2018|
|5|2022|
|6|2017|
|7|2024|
|8|2019|
|9|2021|
|10|2016|

Do not silently extend beyond Season 10; select and record the next rotation policy first.

## Archive provider and licensing

Preferred source: Copernicus ERA5-Land reanalysis (hourly, approximately 9 km global grid, CC BY). Reanalysis is **historical model estimates**, not direct observations at every city, and may need local elevation checks for mountains. Attribution: ECMWF/Copernicus dataset with DOI and model revision. A paid/licensed Open-Meteo service is an alternative ingestion interface; the free Open-Meteo API is not approved for use by the commercial game.

Source:
- https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land
- https://open-meteo.com/en/docs/historical-weather-api
- https://open-meteo.com/en/terms

The existing 2021–2025 country-average table is **not** a geospatial fallback for city-level racing. A missing local record remains *unresolved*, especially for any snow or sub-5°C cancellation. The current system must not be presented as already replaced.

## Required ingestion and integration sequence

1. **Geocode** all location names against a licensed geography source, including country, administrative region, altitude and timezone. Verify ambiguous names, road summits, country borders and differences between start and finish. Batch/review by city-country, not by a nationwide weather average.
2. **Import** licensed archive time series in batches, initially 2025 (Season 1) and 2020 (Season 2) on dates required by stages, then expand to all 2016–2025. Save source license, dataset version and resolved coordinates. Cache hourly weather around local stage time, plus daily extremes.
3. **Preview** one stage-level snapshot using the *same historical day* at route start, finish and important climbing/high-altitude points. Average/weight by route exposure and local riding time; preserve coherent cold fronts across locations. A daily low alone must not determine a daytime cancellation.
4. **Compare** proposed weather vs both old stage/profile snapshots and actual source data, with evidence, and run synthetic race physics and cancellation regression checks before enabling any producer/consumer.
5. **Activate** the new source only for future/not-yet-started races after a reviewed rollout gate. One canonical immutable stage snapshot then supplies preparation, replay, race engine, and final safety decision. The final recheck must not invent an unrelated country-wide temperature; if adjusted, it must represent an evidence-backed forecast update.
6. **Clone safety**: clear source weather and final-decision metadata when cloning stages to a new season and regenerate against that season's historical year. Never copy a 'cancelled' decision to the new season.
7. **No retroactive edits** to finished stages, historical results, fatigue, payouts, team finances, or national race classifications. Validate normal team, national, and youth race calendars separately.

### Production checks used to verify installation

```sql
select count(*) from private.weather_v2_locations; -- 2103 at installation
select game_season, historical_year from private.weather_v2_season_reference_year order by game_season;
select * from private.weather_v2_reference_date('2000-12-09'::date); -- 2025-12-09
select * from private.weather_v2_reference_date('2001-12-09'::date); -- 2020-12-09
select count(*) from private.weather_v2_stage_candidate; -- 3769 at installation
select count(*) from private.weather_v2_hourly_archive; -- 0 at installation
select count(*) from private.weather_v2_daily_archive; -- 0 at installation
```

Acceptance tests before changing production: Dallas/Houston vs Miami/Chicago on same date differ appropriately, neighboring city values correlate under a cold front, daylight saving handled, rainy vs rain probability differ, cold morning/afternoon stage works, mountain finish adjusts for elevation, completed race preserved, future clone cancellation decisions reset, missing geocode does not cancel from nationwide average.

## Pilot progress: geocoded US locations and licensed reanalysis (2026-11-10)

Research-only database changes were applied and recorded as migrations on `main`:

- `weather_v2_geonames_identity_20261110`: GeoNames ID and state/province metadata for verified locations.
- `weather_v2_stage_specific_geography_20261110`: removes the unsafe unique-name-per-country constraint and adds a **stage-specific start/finish city resolution** table. A country/name is not enough to distinguish Miami, Florida from Miami, Texas.
- `weather_v2_read_only_stage_preview_20261110`: computes **read-only** daily and local-afternoon research summaries; returns `not_ready` unless both route endpoints are verified and have exactly 24 records for the reference local date. It never authorizes cancellation.

**Verified geocodes in private table:** Dallas TX (GeoNames 4684888), Houston TX (4699066), College Station TX (4682464), Miami FL (4164138). All GeoNames evidence URLs, timezone names, admin1 states and elevation are retained.

**Source access:** NASA POWER MERRA2 hourly historical reanalysis was selected for the first small pilot. Source model is coarse-grid, unlike the preferred 9-km ERA5-Land: never claim the values represent individual weather stations. NASA POWER data are unrestricted for commercial reuse and request attribution; source URLs and API revision `v2.10.4` were recorded for each imported sample.

**Verified imports:** 624 NASA hourly records in `private.weather_v2_hourly_archive`, for the above cities and limited 2025/2020 historical dates, including timezone-spanning UTC windows. Source measurements `WS10M` were converted from m/s to km/h. Each imported row has UTC timestamp, IANA-local date/hour, temperature, hourly precipitation, wind direction, wind speed and humidity. Snowfall, snow condition, gusts and visibility were **not** imported or inferred.

**Stage-specific research:** 7,538 start/finish stage-point queue records exist; 12 US pilot stage points were independently reviewed against city/state sources. Six race stages have complete `research_preview_only` snapshots retained in the private candidate table as `in_review`. The other 3,763 stage candidates remain unresolved. Zero candidates are approved for production.

Illustration from **NASA POWER modelled hourly source**, not a live forecast or observed station reading:

| Local date | City | 06–08 local mean | 15–17 local mean |
|---|---|---:|---:|
| 2025-12-09 | Dallas, TX | 2.1°C | 15.4°C |
| 2025-12-09 | Houston, TX | 5.0°C | 15.3°C |
| 2020-12-09 | Dallas, TX | 4.7°C | 19.4°C |
| 2020-12-09 | Houston, TX | 6.6°C | 20.1°C |

This verifies the central design point: a sub-5°C winter morning does **not** automatically imply the racing period is below 5°C. However, the current game's planned America-region clock is not confirmed to be the exact local time at each stage. The current preview uses 15–17 local **only as a demonstration**, not as the approved ride-time and full-route temperature.

**Safety:** Existing Dallas–Houston 2000-12-09 cancellation remains unchanged and still requires an engine/weather-policy audit. The already-cloned 2001-12-09 weather decision has **not** been rewritten. Live weather decision RPCs, `race_stages`, results, fatigue, finances, rankings and the clock were not modified. The stage preview and source cache are inaccessible to `anon` and `authenticated` roles.

### New next gates

- Validate stage time semantics, accurate geography along the **entire route**, weather archive resolution, snow/rain/wind parameters, and evidence for min/max/race-time weather before approving a forecast.
- Geocode remaining names with administrative subdivision and stage-specific source evidence. Beware duplicated names across US states/countries and cross-border stages.
- Expand to all mapped stage dates and 2016–2025 with batch/rate limiting, source attribution and ingestion audit. A further source decision may improve model spatial resolution from NASA's coarse-grid MERRA2 to ERA5-Land where viable.
- Build deterministic stage weather **from the same hourly source** for manager display, replay, performance and cancellation, testing local timezone, stage duration, freezing mornings versus afternoons, mountains, route weather, missing data and cloned future cancellation resets.
- Keep the old race engine isolated until acceptance tests and a controlled production promotion are completed.
