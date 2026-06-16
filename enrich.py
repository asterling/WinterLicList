"""LLM-driven menu enrichment via a locally-running Ollama instance.

Adds the following fields to each restaurant record:
  - standouts: 3-5 dish names worth flagging
  - vibe_tags: 3-5 tags drawn from a controlled vocabulary
  - one_liner: ≤100 char distinctive blurb
  - dietary_summary: one sentence on veg/vegan/GF strengths (may be "")

Results are cached by a content hash so repeated runs only re-call the LLM for
restaurants whose menus actually changed.

Usage:
    python enrich.py                       # uses menus-latest.json in cwd
    python enrich.py path/to/menus.json --model qwen2.5:1.5b
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request

OLLAMA_URL = "http://localhost:11434"
DEFAULT_MODEL = "qwen2.5:7b"
CACHE_FILENAME = "enrichment-cache.json"

VIBE_VOCAB = [
    "date night", "casual", "upscale", "family friendly", "quick lunch",
    "business dinner", "groups", "romantic", "trendy", "cozy", "lively",
    "quiet", "celebration", "hidden gem", "neighbourhood favourite",
]

PROMPT_TEMPLATE = """You are tagging a restaurant entry for a Toronto prix-fixe festival.
Return STRICT JSON matching this schema (no markdown, no extra fields):

{{
  "standouts": [3 to 5 dish names taken VERBATIM from the menus below],
  "vibe_tags": [3 to 5 tags from the list below],
  "one_liner": "single sentence under 100 chars about what makes this place distinctive"
}}

ALLOWED VIBE TAGS: {vocab}

Rules for vibe_tags — follow strictly:
- HARD RULE: never use both "upscale" and "trendy" in the same response. Pick at most one.
- HARD RULE: default to "casual" unless dinner price is $60+ or description signals fine dining (white tablecloth, tasting menu, chef-driven). Most Toronto prix-fixe spots are casual or mid-range.
- HARD RULE: only use "hidden gem" if the restaurant is in a non-central neighbourhood OR has under 5 cuisines listed. Hotel restaurants are NEVER hidden gems.
- Pick 3-4 tags from DIFFERENT axes:
    * Formality:  casual | upscale
    * Energy:     lively | quiet | cozy
    * Occasion:   date night | business dinner | groups | celebration | quick lunch | family friendly | romantic
    * Reputation: hidden gem | neighbourhood favourite | trendy
- It is BETTER to return 3 accurate tags than 5 generic ones.

Examples of GOOD selections:
- $35 Italian neighbourhood spot: ["casual", "cozy", "neighbourhood favourite"]
- $75 chef-driven tasting menu: ["upscale", "date night", "celebration"]
- Hotel steakhouse: ["upscale", "business dinner", "groups"]
- Late-night dim sum: ["casual", "lively", "groups"]

Examples of BAD selections (do not produce these):
- ["upscale", "trendy", "date night"]  -- breaks hard rule
- ["upscale", "trendy", "hidden gem"]  -- breaks hard rule, contradictory

Rules for standouts:
- Take dish names exactly as they appear in the menus below (verbatim).
- Mix courses (one appetizer, one main, one dessert) when possible.

Rules for one_liner:
- One sentence, under 100 characters, ideally referencing what's
  distinctive (cuisine angle, chef, neighbourhood, room, signature dish).
- Do not start with "Experience" or "Discover".
- Do NOT call the restaurant a "hidden gem", "must-try", or "best-kept
  secret" — these are empty clichés. Name something concrete instead.
- Do not invent accolades (e.g. "Michelin-starred") unless they appear in
  the description above.

Restaurant: {name}
Cuisines: {cuisines}
Neighbourhood: {hood}
Description: {description}

Lunch menu:
{lunch}

Dinner menu:
{dinner}

Return ONLY the JSON object."""


def content_hash(r: dict) -> str:
    """Stable hash of every field that goes into the prompt."""
    parts = [
        r.get("restaurant_name", ""),
        r.get("description", "") or "",
        ",".join(r.get("cuisines") or []),
        ",".join(r.get("neighbourhoods") or []),
    ]
    for meal in ("Lunch", "Dinner"):
        m = r.get(meal) or {}
        for course in ("appetizers", "main_dishes", "desserts"):
            items = m.get(course) or []
            for it in items:
                parts.append(it.get("name", "") or "")
                parts.append(it.get("description", "") or "")
    blob = "\n".join(parts).encode("utf-8")
    return hashlib.sha1(blob).hexdigest()


def format_menu(menu: dict | None) -> str:
    if not menu:
        return "  (not offered)"
    lines: list[str] = []
    if menu.get("price"):
        lines.append(f"  Price: {menu['price']}")
    for label, key in (("Appetizers", "appetizers"), ("Mains", "main_dishes"), ("Desserts", "desserts")):
        items = menu.get(key) or []
        if items:
            names = "; ".join(i.get("name", "") for i in items if i.get("name"))
            lines.append(f"  {label}: {names}")
    return "\n".join(lines) or "  (empty)"


def build_prompt(r: dict) -> str:
    desc = (r.get("description") or "").strip()
    if len(desc) > 400:
        desc = desc[:397] + "..."
    return PROMPT_TEMPLATE.format(
        vocab=", ".join(f'"{v}"' for v in VIBE_VOCAB),
        name=r.get("restaurant_name", ""),
        cuisines=", ".join(r.get("cuisines") or []),
        hood=", ".join(r.get("neighbourhoods") or []),
        description=desc or "(none provided)",
        lunch=format_menu(r.get("Lunch")),
        dinner=format_menu(r.get("Dinner")),
    )


def call_ollama(prompt: str, model: str, timeout: int = 90) -> str:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.45, "top_p": 0.9, "num_ctx": 4096},
    }
    req = request.Request(
        f"{OLLAMA_URL}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return body.get("response", "")


def parse_enrichment(raw: str) -> dict | None:
    raw = raw.strip()
    if not raw:
        return None
    # Some models wrap JSON in markdown despite format=json; strip it.
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].lstrip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return data


def compute_dietary_summary(r: dict) -> str:
    """Build a one-line summary from the city's explicit dietary flags."""
    counts = {"veg": 0, "vegan": 0, "gf": 0}
    course_label = {"appetizers": "appetizer", "main_dishes": "main", "desserts": "dessert"}
    by_course = {"veg": {}, "vegan": {}, "gf": {}}
    for meal in ("Lunch", "Dinner"):
        m = r.get(meal) or {}
        for course_key, label in course_label.items():
            for item in m.get(course_key) or []:
                if item.get("vegan_opt") == "Yes":
                    counts["vegan"] += 1
                    by_course["vegan"][label] = by_course["vegan"].get(label, 0) + 1
                elif item.get("vegetarian_opt") == "Yes":
                    counts["veg"] += 1
                    by_course["veg"][label] = by_course["veg"].get(label, 0) + 1
                if item.get("gluten_opt") == "Yes":
                    counts["gf"] += 1
                    by_course["gf"][label] = by_course["gf"].get(label, 0) + 1
    if not any(counts.values()):
        return ""
    parts: list[str] = []
    if counts["vegan"]:
        parts.append(f"{counts['vegan']} vegan")
    if counts["veg"]:
        parts.append(f"{counts['veg']} vegetarian")
    if counts["gf"]:
        parts.append(f"{counts['gf']} gluten-free")
    return ", ".join(parts) + " option" + ("s" if sum(counts.values()) > 1 else "") + " across the menus."


def normalize(data: dict) -> dict:
    """Validate and clamp the model output to the expected shape."""
    standouts = data.get("standouts") or []
    if not isinstance(standouts, list):
        standouts = []
    standouts = [str(s).strip() for s in standouts if isinstance(s, (str, int)) and str(s).strip()][:5]

    vibe = data.get("vibe_tags") or []
    if not isinstance(vibe, list):
        vibe = []
    allowed = {v.lower(): v for v in VIBE_VOCAB}
    cleaned: list[str] = []
    for v in vibe:
        if not isinstance(v, str):
            continue
        key = v.strip().lower()
        if key in allowed and allowed[key] not in cleaned:
            cleaned.append(allowed[key])
    # Safety net: model's habitual "upscale + trendy" pair almost never reflects
    # the menu. If both show up, drop "trendy" (rarer truth than "upscale" for
    # genuinely fine-dining listings).
    if "upscale" in cleaned and "trendy" in cleaned:
        cleaned.remove("trendy")
    vibe = cleaned[:4]

    one_liner = data.get("one_liner") or ""
    if not isinstance(one_liner, str):
        one_liner = ""
    one_liner = one_liner.strip()
    if len(one_liner) > 140:
        one_liner = one_liner[:137].rsplit(" ", 1)[0] + "..."

    return {
        "standouts": standouts,
        "vibe_tags": vibe,
        "one_liner": one_liner,
    }


def enrich_one(r: dict, model: str) -> dict | None:
    prompt = build_prompt(r)
    for attempt in (1, 2):
        try:
            raw = call_ollama(prompt, model)
        except (error.URLError, TimeoutError) as e:
            raise RuntimeError(f"Ollama call failed: {e}") from e
        parsed = parse_enrichment(raw)
        if parsed is not None:
            return normalize(parsed)
        if attempt == 1:
            time.sleep(0.5)
    return None


def load_cache(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_cache(path: Path, cache: dict) -> None:
    path.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


def ensure_ollama_ready(model: str) -> None:
    try:
        with request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=3) as resp:
            tags = json.loads(resp.read().decode("utf-8"))
    except (error.URLError, TimeoutError):
        sys.exit(
            "Ollama is not running at http://localhost:11434.\n"
            "Install: https://ollama.com/download  (or `brew install ollama` on macOS)\n"
            "Then run: ollama serve   (in another terminal)\n"
            f"And:    ollama pull {model}"
        )
    available = {m.get("name", "").split(":")[0] for m in tags.get("models", [])} | {
        m.get("name", "") for m in tags.get("models", [])
    }
    if model not in available and model.split(":")[0] not in available:
        sys.exit(
            f"Model '{model}' is not pulled yet.\n"
            f"Run: ollama pull {model}"
        )


def enrich_restaurants(
    menus_path: Path,
    cache_path: Path,
    model: str,
    limit: int | None = None,
    force: bool = False,
) -> tuple[int, int, int]:
    """Returns (calls_made, cache_hits, failures)."""
    ensure_ollama_ready(model)

    restaurants = json.loads(menus_path.read_text(encoding="utf-8"))
    cache = load_cache(cache_path)

    calls = hits = failures = 0
    targets = restaurants if limit is None else restaurants[:limit]
    total = len(targets)

    for idx, r in enumerate(targets, start=1):
        digest = content_hash(r)
        cached = cache.get(digest)
        if cached and not force:
            r["ai"] = cached["ai"]
            hits += 1
            continue

        name = r.get("restaurant_name", "?")
        print(f"[{idx}/{total}] {name}...", flush=True, end=" ")
        started = time.time()
        try:
            enriched = enrich_one(r, model)
        except RuntimeError as e:
            print(f"FAILED ({e})")
            failures += 1
            continue
        elapsed = time.time() - started

        if enriched is None:
            print(f"unparseable JSON in {elapsed:.1f}s")
            failures += 1
            continue

        enriched["dietary_summary"] = compute_dietary_summary(r)
        enriched["model"] = model
        enriched["generated_at"] = datetime.now(timezone.utc).isoformat()
        r["ai"] = enriched
        cache[digest] = {"name": name, "ai": enriched}
        calls += 1
        print(f"{elapsed:.1f}s")

        # Periodic save so a crash doesn't lose progress.
        if calls % 10 == 0:
            save_cache(cache_path, cache)

    save_cache(cache_path, cache)
    menus_path.write_text(
        json.dumps(restaurants, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return calls, hits, failures


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich menu JSON with local LLM-generated tags.")
    parser.add_argument("menus", nargs="?", default="menus-latest.json", help="Path to menus JSON.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model tag (default: %(default)s).")
    parser.add_argument("--cache", default=CACHE_FILENAME, help="Path to enrichment cache JSON.")
    parser.add_argument("--limit", type=int, default=None, help="Only process first N restaurants (testing).")
    parser.add_argument("--force", action="store_true", help="Ignore the cache; re-run every restaurant.")
    args = parser.parse_args()

    menus_path = Path(args.menus)
    if not menus_path.exists():
        sys.exit(f"Menus file not found: {menus_path}")
    cache_path = Path(args.cache)

    print(f"Enriching {menus_path} with {args.model}; cache={cache_path}")
    calls, hits, failures = enrich_restaurants(
        menus_path, cache_path, args.model, limit=args.limit, force=args.force
    )
    print(f"\nDone. LLM calls: {calls}, cache hits: {hits}, failures: {failures}")


if __name__ == "__main__":
    main()
