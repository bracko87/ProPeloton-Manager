#!/usr/bin/env python3
"""
weather_normals_builder.py

Build weekly country weather normals for the existing PostgreSQL table:
public.country_weather_weekly_normals

This version can work from either:
1) a representative points CSV, or
2) a JSON country list like:
   [
     {"country_code": "AL", "name": "Albania"},
     {"country_code": "DZ", "name": "Algeria"}
   ]

If you use the JSON list, the script will first auto-build a starter
representative_points.csv using Open-Meteo geocoding.

Outputs:
- representative_points.csv (starter file if using JSON input)
- country_weather_weekly_normals.csv
- country_weather_weekly_normals.insert.sql (optional)

It does NOT alter your schema.
It only prepares data for the already existing table:
public.country_weather_weekly_normals
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import statistics
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


# -----------------------------
# Configuration
# -----------------------------

START_DATE = "2021-01-01"
END_DATE = "2025-12-31"
SOURCE_LABEL = "ERA5_2021_2025"
YEARS_USED = 5

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"

DAILY_VARS = [
    "weather_code",
    "temperature_2m_mean",
    "temperature_2m_min",
    "temperature_2m_max",
    "precipitation_sum",
    "snowfall_sum",
    "wind_speed_10m_max",
]

OUTPUT_COLUMNS = [
    "country_code",
    "week_of_year",
    "years_used",
    "source_label",
    "avg_temp_c",
    "avg_min_temp_c",
    "avg_max_temp_c",
    "avg_precip_mm",
    "avg_snow_cm",
    "avg_wind_kmh",
    "p_clear",
    "p_partly_cloudy",
    "p_overcast",
    "p_foggy",
    "p_drizzle",
    "p_rain",
    "p_heavy_rain",
    "p_sleet",
    "p_snow",
    "p_thunderstorm",
    "p_windy",
    "temp_stddev_c",
    "wind_stddev_kmh",
]

POINTS_COLUMNS = [
    "country_code",
    "name",
    "point_name",
    "latitude",
    "longitude",
    "weight",
]

CATEGORY_KEYS = [
    "p_clear",
    "p_partly_cloudy",
    "p_overcast",
    "p_foggy",
    "p_drizzle",
    "p_rain",
    "p_heavy_rain",
    "p_sleet",
    "p_snow",
    "p_thunderstorm",
    "p_windy",
]

SQL_NUMERIC_KEYS = {
    "week_of_year", "years_used",
    "avg_temp_c", "avg_min_temp_c", "avg_max_temp_c",
    "avg_precip_mm", "avg_snow_cm", "avg_wind_kmh",
    "p_clear", "p_partly_cloudy", "p_overcast", "p_foggy",
    "p_drizzle", "p_rain", "p_heavy_rain", "p_sleet",
    "p_snow", "p_thunderstorm", "p_windy",
    "temp_stddev_c", "wind_stddev_kmh",
}

WINDY_THRESHOLD_KMH = 30.0


# Hardcoded fallback only for tricky cases if geocoding returns nothing
GEOCODE_FALLBACKS = {
    "XK": {"point_name": "Pristina", "latitude": 42.6629, "longitude": 21.1655},
}


@dataclass(frozen=True)
class Country:
    country_code: str
    name: str


@dataclass(frozen=True)
class Point:
    country_code: str
    country_name: str
    point_name: str
    latitude: float
    longitude: float
    weight: float


# -----------------------------
# Utility helpers
# -----------------------------

def fetch_json(url: str, retries: int = 4, backoff: float = 1.5) -> dict:
    headers = {"User-Agent": "country-weather-weekly-normals-builder/1.1"}
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            if attempt == retries - 1:
                raise RuntimeError(f"Failed to fetch URL after {retries} attempts:\n{url}\n{exc}") from exc
            time.sleep(backoff ** attempt)
    raise AssertionError("unreachable")


def safe_float(value) -> Optional[float]:
    if value is None:
        return None
    try:
        if isinstance(value, str) and value.strip() == "":
            return None
        return float(value)
    except Exception:
        return None


def round_or_none(value: Optional[float], digits: int = 2) -> Optional[float]:
    return None if value is None else round(value, digits)


def mean_or_none(values: Iterable[Optional[float]]) -> Optional[float]:
    arr = [v for v in values if v is not None]
    return None if not arr else sum(arr) / len(arr)


def stddev_or_none(values: Iterable[Optional[float]]) -> Optional[float]:
    arr = [v for v in values if v is not None]
    return None if len(arr) < 2 else statistics.pstdev(arr)


def sql_literal(value, key: Optional[str] = None) -> str:
    if value is None:
        return "null"
    if key in SQL_NUMERIC_KEYS:
        if isinstance(value, float) and not math.isfinite(value):
            return "null"
        return str(value)
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            return "null"
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


# -----------------------------
# Input loading
# -----------------------------

def read_countries_json(path: Path) -> List[Country]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("countries.json must contain a JSON array")

    countries: List[Country] = []
    for i, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"countries.json item #{i} is not an object")
        code = str(item.get("country_code", "")).strip().upper()
        name = str(item.get("name", "")).strip()
        if not code or not name:
            raise ValueError(f"countries.json item #{i} must contain country_code and name")
        countries.append(Country(country_code=code, name=name))
    return countries


def read_points_csv(path: Path) -> Dict[str, List[Point]]:
    countries = defaultdict(list)
    with path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {"country_code", "name", "point_name", "latitude", "longitude", "weight"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Input CSV missing required columns: {sorted(missing)}")

        for i, row in enumerate(reader, start=2):
            try:
                point = Point(
                    country_code=(row["country_code"] or "").strip().upper(),
                    country_name=(row["name"] or "").strip(),
                    point_name=(row.get("point_name") or "").strip(),
                    latitude=float(row["latitude"]),
                    longitude=float(row["longitude"]),
                    weight=float(row["weight"]),
                )
            except Exception as exc:
                raise ValueError(f"Bad input row {i}: {row}\n{exc}") from exc

            if not point.country_code or not point.country_name:
                raise ValueError(f"Bad input row {i}: country_code and name are required")

            countries[point.country_code].append(point)

    return dict(countries)


# -----------------------------
# Geocoding starter points
# -----------------------------

def build_geocode_url(name: str, country_code: str) -> str:
    params = {
        "name": name,
        "count": 10,
        "language": "en",
        "format": "json",
        "countryCode": country_code,
    }
    return GEOCODE_URL + "?" + urllib.parse.urlencode(params)


def choose_best_geocode_result(country_name: str, results: List[dict]) -> Optional[dict]:
    if not results:
        return None

    country_name_lower = country_name.strip().lower()

    # Prefer exact name match
    for r in results:
        rname = str(r.get("name", "")).strip().lower()
        if rname == country_name_lower:
            return r

    # Prefer admin/country-ish records if exact match is missing
    for r in results:
        feature_code = str(r.get("feature_code", "")).upper()
        if feature_code in {"PCLI", "PCLD", "PCLF", "PCLS", "PCLIX"}:
            return r

    # Otherwise first result
    return results[0]


def geocode_country(country: Country, verbose: bool = False) -> Point:
    if country.country_code in GEOCODE_FALLBACKS:
        fb = GEOCODE_FALLBACKS[country.country_code]
        if verbose:
            print(f"Using fallback point for {country.country_code} {country.name}", file=sys.stderr)
        return Point(
            country_code=country.country_code,
            country_name=country.name,
            point_name=fb["point_name"],
            latitude=float(fb["latitude"]),
            longitude=float(fb["longitude"]),
            weight=1.0,
        )

    url = build_geocode_url(country.name, country.country_code)
    data = fetch_json(url)
    results = data.get("results") or []

    chosen = choose_best_geocode_result(country.name, results)
    if not chosen:
        raise RuntimeError(f"Geocoding returned no usable result for {country.country_code} {country.name}")

    lat = safe_float(chosen.get("latitude"))
    lon = safe_float(chosen.get("longitude"))
    if lat is None or lon is None:
        raise RuntimeError(f"Geocoding result missing lat/lon for {country.country_code} {country.name}")

    point_name = str(chosen.get("name") or country.name).strip()

    return Point(
        country_code=country.country_code,
        country_name=country.name,
        point_name=point_name,
        latitude=lat,
        longitude=lon,
        weight=1.0,
    )


def write_points_csv(path: Path, points: List[Point]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=POINTS_COLUMNS)
        writer.writeheader()
        for p in points:
            writer.writerow({
                "country_code": p.country_code,
                "name": p.country_name,
                "point_name": p.point_name,
                "latitude": f"{p.latitude:.6f}",
                "longitude": f"{p.longitude:.6f}",
                "weight": f"{p.weight:.2f}",
            })


def build_points_from_countries(countries: List[Country], verbose: bool = False, sleep_seconds: float = 0.25) -> Dict[str, List[Point]]:
    out = defaultdict(list)
    total = len(countries)

    for i, country in enumerate(countries, start=1):
        if verbose:
            print(f"Geocoding {i}/{total}: {country.country_code} {country.name}", file=sys.stderr)
        point = geocode_country(country, verbose=verbose)
        out[country.country_code].append(point)
        time.sleep(max(0.0, sleep_seconds))

    return dict(out)


# -----------------------------
# Weather classification
# -----------------------------

def code_to_flags(weather_code: Optional[int], wind_kmh: Optional[float]) -> Dict[str, float]:
    flags = {k: 0.0 for k in CATEGORY_KEYS}

    if weather_code is None:
        pass
    elif weather_code == 0:
        flags["p_clear"] = 1.0
    elif weather_code in (1, 2):
        flags["p_partly_cloudy"] = 1.0
    elif weather_code == 3:
        flags["p_overcast"] = 1.0
    elif weather_code in (45, 48):
        flags["p_foggy"] = 1.0
    elif weather_code in (51, 53, 55):
        flags["p_drizzle"] = 1.0
    elif weather_code in (56, 57, 66, 67):
        flags["p_sleet"] = 1.0
    elif weather_code in (61, 63, 80, 81):
        flags["p_rain"] = 1.0
    elif weather_code in (65, 82):
        flags["p_heavy_rain"] = 1.0
    elif weather_code in (71, 73, 75, 77, 85, 86):
        flags["p_snow"] = 1.0
    elif weather_code in (95, 96, 99):
        flags["p_thunderstorm"] = 1.0

    if wind_kmh is not None and wind_kmh >= WINDY_THRESHOLD_KMH:
        flags["p_windy"] = 1.0

    return flags


# -----------------------------
# Archive fetch + weekly aggregation
# -----------------------------

def build_archive_url(lat: float, lon: float) -> str:
    params = {
        "latitude": f"{lat:.6f}",
        "longitude": f"{lon:.6f}",
        "start_date": START_DATE,
        "end_date": END_DATE,
        "timezone": "GMT",
        "models": "era5",
        "cell_selection": "land",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
        "daily": ",".join(DAILY_VARS),
    }
    return ARCHIVE_URL + "?" + urllib.parse.urlencode(params)


def compute_point_weekly_rows(point: Point, verbose: bool = False) -> Dict[int, Dict[str, object]]:
    url = build_archive_url(point.latitude, point.longitude)
    if verbose:
        print(f"Fetching archive for {point.country_code} / {point.point_name}", file=sys.stderr)

    data = fetch_json(url)
    daily = data.get("daily") or {}
    required = ["time", *DAILY_VARS]
    missing = [k for k in required if k not in daily]
    if missing:
        raise RuntimeError(f"Archive response missing daily keys for {point.country_code}: {missing}")

    days_by_week = defaultdict(list)

    for idx, date_text in enumerate(daily["time"]):
        date_obj = dt.date.fromisoformat(date_text)
        iso_week = int(date_obj.isocalendar().week)

        wind = safe_float(daily["wind_speed_10m_max"][idx])
        weather_code = daily["weather_code"][idx]
        try:
            weather_code = int(weather_code) if weather_code is not None else None
        except Exception:
            weather_code = None

        flags = code_to_flags(weather_code, wind)

        days_by_week[iso_week].append({
            "temp_mean": safe_float(daily["temperature_2m_mean"][idx]),
            "temp_min": safe_float(daily["temperature_2m_min"][idx]),
            "temp_max": safe_float(daily["temperature_2m_max"][idx]),
            "precip": safe_float(daily["precipitation_sum"][idx]),
            "snowfall_cm": (safe_float(daily["snowfall_sum"][idx]) or 0.0),
            "wind_kmh": wind,
            **flags,
        })

    out = {}
    for week in range(1, 54):
        rows = days_by_week.get(week, [])
        out[week] = {
            "country_code": point.country_code,
            "week_of_year": week,
            "years_used": YEARS_USED,
            "source_label": SOURCE_LABEL,
            "avg_temp_c": round_or_none(mean_or_none(r["temp_mean"] for r in rows)),
            "avg_min_temp_c": round_or_none(mean_or_none(r["temp_min"] for r in rows)),
            "avg_max_temp_c": round_or_none(mean_or_none(r["temp_max"] for r in rows)),
            "avg_precip_mm": round_or_none(mean_or_none(r["precip"] for r in rows)),
            "avg_snow_cm": round_or_none(mean_or_none(r["snowfall_cm"] for r in rows)),
            "avg_wind_kmh": round_or_none(mean_or_none(r["wind_kmh"] for r in rows)),
            "p_clear": round_or_none(mean_or_none(r["p_clear"] for r in rows), 4) or 0.0,
            "p_partly_cloudy": round_or_none(mean_or_none(r["p_partly_cloudy"] for r in rows), 4) or 0.0,
            "p_overcast": round_or_none(mean_or_none(r["p_overcast"] for r in rows), 4) or 0.0,
            "p_foggy": round_or_none(mean_or_none(r["p_foggy"] for r in rows), 4) or 0.0,
            "p_drizzle": round_or_none(mean_or_none(r["p_drizzle"] for r in rows), 4) or 0.0,
            "p_rain": round_or_none(mean_or_none(r["p_rain"] for r in rows), 4) or 0.0,
            "p_heavy_rain": round_or_none(mean_or_none(r["p_heavy_rain"] for r in rows), 4) or 0.0,
            "p_sleet": round_or_none(mean_or_none(r["p_sleet"] for r in rows), 4) or 0.0,
            "p_snow": round_or_none(mean_or_none(r["p_snow"] for r in rows), 4) or 0.0,
            "p_thunderstorm": round_or_none(mean_or_none(r["p_thunderstorm"] for r in rows), 4) or 0.0,
            "p_windy": round_or_none(mean_or_none(r["p_windy"] for r in rows), 4) or 0.0,
            "temp_stddev_c": round_or_none(stddev_or_none(r["temp_mean"] for r in rows)),
            "wind_stddev_kmh": round_or_none(stddev_or_none(r["wind_kmh"] for r in rows)),
        }

    return out


def weighted_average(records: List[Tuple[float, dict]], key: str, default_zero: bool = False, digits: int = 2) -> Optional[float]:
    usable = []
    for w, rec in records:
        v = rec.get(key)
        if v is None:
            continue
        usable.append((float(w), float(v)))

    if not usable:
        return 0.0 if default_zero else None

    total_w = sum(w for w, _ in usable)
    if total_w <= 0:
        return 0.0 if default_zero else None

    value = sum(w * v for w, v in usable) / total_w
    return round(value, digits)


def combine_country_rows(points: List[Point], point_rows: Dict[str, Dict[int, dict]]) -> List[dict]:
    total_weight = sum(max(0.0, p.weight) for p in points)
    if total_weight <= 0:
        raise ValueError(f"Country {points[0].country_code} has non-positive total weight")

    out = []
    for week in range(1, 54):
        weighted_rows = []
        for p in points:
            point_id = f"{p.country_code}::{p.point_name}::{p.latitude:.6f},{p.longitude:.6f}"
            weighted_rows.append((p.weight / total_weight, point_rows[point_id][week]))

        out.append({
            "country_code": points[0].country_code,
            "week_of_year": week,
            "years_used": YEARS_USED,
            "source_label": SOURCE_LABEL,
            "avg_temp_c": weighted_average(weighted_rows, "avg_temp_c", digits=2),
            "avg_min_temp_c": weighted_average(weighted_rows, "avg_min_temp_c", digits=2),
            "avg_max_temp_c": weighted_average(weighted_rows, "avg_max_temp_c", digits=2),
            "avg_precip_mm": weighted_average(weighted_rows, "avg_precip_mm", digits=2),
            "avg_snow_cm": weighted_average(weighted_rows, "avg_snow_cm", digits=2),
            "avg_wind_kmh": weighted_average(weighted_rows, "avg_wind_kmh", digits=2),
            "p_clear": weighted_average(weighted_rows, "p_clear", default_zero=True, digits=4),
            "p_partly_cloudy": weighted_average(weighted_rows, "p_partly_cloudy", default_zero=True, digits=4),
            "p_overcast": weighted_average(weighted_rows, "p_overcast", default_zero=True, digits=4),
            "p_foggy": weighted_average(weighted_rows, "p_foggy", default_zero=True, digits=4),
            "p_drizzle": weighted_average(weighted_rows, "p_drizzle", default_zero=True, digits=4),
            "p_rain": weighted_average(weighted_rows, "p_rain", default_zero=True, digits=4),
            "p_heavy_rain": weighted_average(weighted_rows, "p_heavy_rain", default_zero=True, digits=4),
            "p_sleet": weighted_average(weighted_rows, "p_sleet", default_zero=True, digits=4),
            "p_snow": weighted_average(weighted_rows, "p_snow", default_zero=True, digits=4),
            "p_thunderstorm": weighted_average(weighted_rows, "p_thunderstorm", default_zero=True, digits=4),
            "p_windy": weighted_average(weighted_rows, "p_windy", default_zero=True, digits=4),
            "temp_stddev_c": weighted_average(weighted_rows, "temp_stddev_c", digits=2),
            "wind_stddev_kmh": weighted_average(weighted_rows, "wind_stddev_kmh", digits=2),
        })

    return out


# -----------------------------
# Output writers
# -----------------------------

def write_weekly_csv(path: Path, rows: List[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def write_guarded_insert_sql(path: Path, rows: List[dict]) -> None:
    lines = []
    lines.append("begin;")
    lines.append("")
    lines.append("do $$")
    lines.append("begin")
    lines.append("  if exists (")
    lines.append("    select 1")
    lines.append("    from public.country_weather_weekly_normals")
    lines.append("    limit 1")
    lines.append("  ) then")
    lines.append("    raise exception 'Aborted: public.country_weather_weekly_normals is not empty.';")
    lines.append("  end if;")
    lines.append("end $$;")
    lines.append("")
    lines.append("insert into public.country_weather_weekly_normals (")
    lines.append("  " + ",\n  ".join(OUTPUT_COLUMNS))
    lines.append(")")
    lines.append("values")

    value_chunks = []
    for row in rows:
        vals = ", ".join(sql_literal(row.get(k), k) for k in OUTPUT_COLUMNS)
        value_chunks.append(f"  ({vals})")

    lines.append(",\n".join(value_chunks))
    lines.append(";")
    lines.append("")
    lines.append("commit;")
    lines.append("")
    lines.append("-- sanity checks")
    lines.append("select count(*) as total_rows from public.country_weather_weekly_normals;")
    lines.append("select count(distinct country_code) as countries, min(week_of_year) as min_week, max(week_of_year) as max_week from public.country_weather_weekly_normals;")

    path.write_text("\n".join(lines), encoding="utf-8")


# -----------------------------
# Main workflow
# -----------------------------

def build_from_points(points_by_country: Dict[str, List[Point]], verbose: bool = False, sleep_seconds: float = 0.25) -> List[dict]:
    point_rows: Dict[str, Dict[int, dict]] = {}
    all_rows: List[dict] = []

    total_points = sum(len(v) for v in points_by_country.values())
    done = 0

    for country_code, points in points_by_country.items():
        for p in points:
            point_id = f"{p.country_code}::{p.point_name}::{p.latitude:.6f},{p.longitude:.6f}"
            point_rows[point_id] = compute_point_weekly_rows(p, verbose=verbose)
            done += 1
            if verbose:
                print(f"Archive progress: {done}/{total_points} points", file=sys.stderr)
            time.sleep(max(0.0, sleep_seconds))

        combined = combine_country_rows(points, point_rows)
        all_rows.extend(combined)

    all_rows.sort(key=lambda r: (r["country_code"], r["week_of_year"]))
    return all_rows


def parse_args():
    parser = argparse.ArgumentParser(description="Build weekly country weather normals for public.country_weather_weekly_normals")

    parser.add_argument("--input-points-csv", help="Existing representative points CSV")
    parser.add_argument("--input-countries-json", help="JSON country list like [{country_code,name}, ...]")

    parser.add_argument("--out-points-csv", help="Write starter representative points CSV")
    parser.add_argument("--out-csv", required=True, help="Output weekly normals CSV")
    parser.add_argument("--out-sql", help="Optional guarded INSERT SQL output")

    parser.add_argument("--sleep-seconds", type=float, default=0.25, help="Delay between API requests")
    parser.add_argument("--verbose", action="store_true")

    args = parser.parse_args()

    if not args.input_points_csv and not args.input_countries_json:
        parser.error("Provide either --input-points-csv or --input-countries-json")

    return args


def main() -> int:
    args = parse_args()

    if args.input_points_csv:
        points_by_country = read_points_csv(Path(args.input_points_csv))
    else:
        countries = read_countries_json(Path(args.input_countries_json))
        points_by_country = build_points_from_countries(
            countries=countries,
            verbose=args.verbose,
            sleep_seconds=args.sleep_seconds,
        )

        if args.out_points_csv:
            starter_points = []
            for code in sorted(points_by_country.keys()):
                starter_points.extend(points_by_country[code])
            write_points_csv(Path(args.out_points_csv), starter_points)
            if args.verbose:
                print(f"Wrote starter points CSV to {args.out_points_csv}", file=sys.stderr)

    all_rows = build_from_points(
        points_by_country=points_by_country,
        verbose=args.verbose,
        sleep_seconds=args.sleep_seconds,
    )

    write_weekly_csv(Path(args.out_csv), all_rows)
    if args.verbose:
        print(f"Wrote weekly normals CSV to {args.out_csv}", file=sys.stderr)

    if args.out_sql:
        write_guarded_insert_sql(Path(args.out_sql), all_rows)
        if args.verbose:
            print(f"Wrote guarded SQL to {args.out_sql}", file=sys.stderr)

    print(f"Done. Wrote {len(all_rows)} weekly rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())