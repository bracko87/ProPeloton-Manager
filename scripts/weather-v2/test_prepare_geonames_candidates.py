import csv
import tempfile
import unittest
import zipfile
from pathlib import Path
from prepare_geonames_candidates import read_queue, scan_zip, produce


def row(gid, name, lat, lon, cc, admin, pop, timezone):
    fields = [gid, name, name, "", lat, lon, "P", "PPL", cc, "", admin,
              "", "", "", str(pop), "", "", timezone, "2026-01-01"]
    return "\t".join(fields)


class GeoNamesCandidateTest(unittest.TestCase):
    def test_ambiguous_country_and_empty_location(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            inp = root / "queue.csv"
            out = root / "out.csv"
            cities = root / "cities.zip"
            with inp.open("w", newline="") as stream:
                writer = csv.writer(stream)
                writer.writerow(["location_id", "name", "country_code"])
                writer.writerows([[1, "Miami", "US"], [2, "Dallas", "US"],
                                  [3, "Nonexistent", "US"]])
            with zipfile.ZipFile(cities, "w") as archive:
                archive.writestr("cities500.txt", "\n".join([
                    row("11", "Miami", "25.774", "-80.19", "US", "FL", 300000, "America/New_York"),
                    row("12", "Miami", "35.69", "-100.64", "US", "TX", 589, "America/Chicago"),
                    row("13", "Dallas", "32.78", "-96.80", "US", "TX", 1000000, "America/Chicago"),
                ]))
            queue = read_queue(inp)
            records = scan_zip(cities, queue)
            summary = produce(queue, records, out)
            self.assertEqual(summary, {"needs_review": 1, "ambiguous": 1,
                                       "unmatched": 1})
            with out.open(encoding="utf-8", newline="") as stream:
                saved = list(csv.DictReader(stream))
            self.assertEqual(len(saved), 4)
            self.assertTrue(all(r["review_required"] == "yes" for r in saved))
            self.assertEqual(len([r for r in saved if r["name"] == "Miami"]), 2)


if __name__ == "__main__":
    unittest.main()
