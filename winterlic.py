"""Fetch and persist the current Toronto Winterlicious / Summerlicious menus.

Toronto's open-data endpoint is the same year-round; the city swaps the active
campaign in place (Winterlicious in Jan/Feb, Summerlicious in Jul/Aug). This
script writes three files so the frontend can stay generic:

  - menus-latest.json                  always the freshest snapshot
  - menus-{Winter,Summer}licious-YYYY.json  per-campaign archive
  - season.json                        metadata (label, season, year)
"""

import argparse
import json
import os
from datetime import datetime
from pathlib import Path

import requests

API_URL = "https://secure.toronto.ca/c3api_data/v2/DataAccess.svc/Licious/map_data"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; WinterLicList/1.0; +https://github.com/asterling/WinterLicList)",
    "Accept": "application/json",
}

HERE = Path(__file__).parent


def fetch_all(top: int = 1000) -> list:
    resp = requests.get(API_URL, params={"$skip": 0, "$top": top}, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json().get("value", [])


# Best-effort festival dates per year. Update these when the City publishes
# the dates for a new edition; otherwise the calendar export silently no-ops.
FESTIVAL_DATES = {
    ("Winterlicious", 2026): ("2026-01-30", "2026-02-12"),
    ("Summerlicious", 2026): ("2026-07-03", "2026-07-16"),
    ("Winterlicious", 2027): ("2027-01-29", "2027-02-11"),
}


def detect_season(today: datetime | None = None) -> tuple[str, int]:
    """Pick the campaign that is most relevant right now.

    Override with LICIOUS_SEASON=Winter|Summer if you need to force one.
    """
    override = os.getenv("LICIOUS_SEASON", "").strip().lower()
    today = today or datetime.utcnow()
    if override in ("winter", "winterlicious"):
        return ("Winterlicious", today.year)
    if override in ("summer", "summerlicious"):
        return ("Summerlicious", today.year)

    month = today.month
    if month <= 6:
        return ("Winterlicious", today.year)
    return ("Summerlicious", today.year)


def write_json(path: Path, payload) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch (and optionally enrich) Toronto Licious menus.")
    parser.add_argument("--enrich", action="store_true", help="Run local LLM enrichment after fetching.")
    parser.add_argument("--no-fetch", action="store_true", help="Skip fetch; only run enrichment on existing JSON.")
    parser.add_argument("--model", default="qwen2.5:7b", help="Ollama model tag for enrichment.")
    parser.add_argument("--limit", type=int, default=None, help="Enrich only the first N restaurants (testing).")
    args = parser.parse_args()

    if not args.no_fetch:
        restaurants = fetch_all()
        if not restaurants:
            print("No data returned from API.")
            return
    else:
        restaurants = None  # set below from existing file

    season, year = detect_season()
    label = f"{season} {year}"
    dates = FESTIVAL_DATES.get((season, year))

    latest_path = HERE / "menus-latest.json"
    archive_path = HERE / f"menus-{season}-{year}.json"

    if restaurants is not None:
        # Carry over AI enrichment from the previous snapshot so a fresh fetch
        # without --enrich doesn't wipe months of LLM work. enrich.py's cache
        # will re-prompt only when a restaurant's content hash changes.
        if latest_path.exists():
            try:
                prev = json.loads(latest_path.read_text(encoding="utf-8"))
                prev_ai = {p.get("id"): p.get("ai") for p in prev if p.get("ai")}
                if prev_ai:
                    preserved = 0
                    for r in restaurants:
                        ai = prev_ai.get(r.get("id"))
                        if ai:
                            r["ai"] = ai
                            preserved += 1
                    if preserved:
                        print(f"Preserved AI enrichment for {preserved} restaurants.")
            except (json.JSONDecodeError, OSError) as e:
                print(f"Warning: could not preserve prior AI fields ({e}).")

        write_json(latest_path, restaurants)
        write_json(archive_path, restaurants)
        season_payload = {
            "season": season,
            "year": year,
            "label": label,
            "fetched_at": datetime.utcnow().isoformat() + "Z",
        }
        if dates:
            start, end = dates
            season_payload["dates_start"] = start
            season_payload["dates_end"] = end
        write_json(HERE / "season.json", season_payload)
        print(f"Saved {len(restaurants)} restaurants for {label}.")

    if args.enrich or args.no_fetch:
        from enrich import enrich_restaurants
        if not latest_path.exists():
            print(f"Cannot enrich: {latest_path} is missing. Drop --no-fetch.")
            return
        cache_path = HERE / "enrichment-cache.json"
        calls, hits, failures = enrich_restaurants(
            latest_path, cache_path, args.model, limit=args.limit
        )
        print(f"Enrichment: {calls} new, {hits} cached, {failures} failed.")
        # Mirror enriched data into the per-season archive so both stay in sync.
        if archive_path.exists():
            archive_path.write_bytes(latest_path.read_bytes())


if __name__ == "__main__":
    main()
