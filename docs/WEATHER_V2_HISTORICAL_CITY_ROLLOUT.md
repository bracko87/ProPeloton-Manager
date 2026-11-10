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
