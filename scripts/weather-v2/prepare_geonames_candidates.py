#!/usr/bin/env python3
"""Build a REVIEW-ONLY city match report from a GeoNames cities ZIP.

No database connections, and no changes to gameplay. GeoNames data: CC BY 4.0.
A name/country match is never an automatic proof of administrative identity.
"""
import argparse
import csv
import io
import re
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

COLUMNS = [
    "location_id", "name", "country_code", "status", "candidate_count",
    "geonames_id", "matched_name", "admin1_code", "latitude", "longitude",
    "timezone_iana", "population", "source_url", "review_required",
]


def normalize(value):
    folded = unicodedata.normalize("NFKD", value.casefold())
    chars = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", re.sub(r"[^\w]+", " ", chars, flags=re.UNICODE)).strip()


def read_queue(path):
    wanted = defaultdict(list)
    seen_ids = set()
    with open(path, encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            loc_id = str(row.get("location_id", "")).strip()
            country = str(row.get("country_code", "")).upper().strip()
            name = str(row.get("name", "")).strip()
            if not loc_id.isdecimal() or loc_id in seen_ids:
                raise ValueError(f"Invalid or repeated location_id: {loc_id!r}")
            if not re.fullmatch(r"[A-Z]{2}", country) or not normalize(name):
                raise ValueError(f"Invalid country/name for location {loc_id}")
            seen_ids.add(loc_id)
            wanted[(country, normalize(name))].append((loc_id, name, country))
    if not seen_ids:
        raise ValueError("No location names supplied")
    return wanted


def scan_zip(path, wanted):
    candidates = defaultdict(dict)
    required_countries = {country for country, _ in wanted}
    with zipfile.ZipFile(path) as archive:
        members = [info for info in archive.infolist()
                   if info.filename.endswith(".txt") and "/" not in info.filename]
        if len(members) != 1:
            raise ValueError("Expected exactly one GeoNames cities .txt file in ZIP")
        with archive.open(members[0]) as raw:
            reader = csv.reader(io.TextIOWrapper(raw, encoding="utf-8", errors="replace"), delimiter="\t")
            for fields in reader:
                if len(fields) < 18 or fields[8] not in required_countries or fields[6] != "P":
                    continue
                country = fields[8]
                names = {normalize(fields[1]), normalize(fields[2])}
                # Aliases are potential matches, not proofs of location identity.
                names.update(normalize(x) for x in fields[3].split(",") if x)
                names.discard("")
                matched = [k for k in names if (country, k) in wanted]
                if not matched:
                    continue
                record = {
                    "geonames_id": fields[0], "matched_name": fields[1],
                    "admin1_code": fields[10], "latitude": fields[4],
                    "longitude": fields[5], "timezone_iana": fields[17],
                    "population": fields[14] or "0",
                    "source_url": f"https://www.geonames.org/{fields[0]}",
                }
                for key in matched:
                    candidates[(country, key)][fields[0]] = record
    return candidates


def produce(wanted, candidates, output):
    summary = defaultdict(int)
    output = Path(output)
    with output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=COLUMNS)
        writer.writeheader()
        for key, locations in sorted(wanted.items()):
            found = sorted(candidates.get(key, {}).values(), key=lambda x: (
                -int(x["population"]), int(x["geonames_id"])))
            state = "unmatched" if not found else "needs_review" if len(found) == 1 else "ambiguous"
            for location_id, name, country in locations:
                summary[state] += 1
                if not found:
                    writer.writerow({"location_id": location_id, "name": name,
                                     "country_code": country, "status": state,
                                     "candidate_count": 0, "review_required": "yes"})
                else:
                    # 10 candidate examples are enough; preserve real count.
                    for candidate in found[:10]:
                        writer.writerow({"location_id": location_id, "name": name,
                                         "country_code": country, "status": state,
                                         "candidate_count": len(found),
                                         "review_required": "yes", **candidate})
    return dict(summary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="CSV of location_id,name,country_code")
    parser.add_argument("--geonames-zip", required=True, help="Licensed GeoNames cities500.zip")
    parser.add_argument("--output", required=True, help="New review-only CSV output")
    args = parser.parse_args()
    wanted = read_queue(args.input)
    found = scan_zip(args.geonames_zip, wanted)
    summary = produce(wanted, found, args.output)
    print("GeoNames CC BY 4.0; results are NOT production-approved:", summary)


if __name__ == "__main__":
    main()
