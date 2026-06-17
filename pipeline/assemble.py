"""
Assembler — merges all extracted game objects, resolves player names, merges
announcement venues, and writes the final /data/league.json.

Run order: ingest → classify → workbook → extract → assemble

Re-runnable: just re-run after each new weekend's games are extracted.
"""

import json
import re
from pathlib import Path

from pipeline import resolve as resolver_module

EXTRACTED_DIR = Path(__file__).parent / "extracted"
CLASSIFIED = Path(__file__).parent / "classified.json"
RAW_DIR = Path(__file__).parent / "raw"
CANONICAL_FILE = Path(__file__).parent / "canonical_players.json"
LEAGUE_JSON = Path(__file__).parent.parent / "data" / "league.json"

DAYS_MAP = {
    "monday": "Mon", "tuesday": "Tue", "wednesday": "Wed",
    "thursday": "Thu", "friday": "Fri", "saturday": "Sat", "sunday": "Sun",
}
MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def _parse_announcement_venue(subject: str, body: str) -> str | None:
    """Extract venue name from an announcement email."""
    # Subject often: "Saturday, May 9, Kaiser, 7 am"
    parts = [p.strip() for p in subject.split(",")]
    for part in parts[1:]:
        if not re.search(r"\b(?:am|pm|\d+:\d+|\d+\s*(?:am|pm))\b", part, re.IGNORECASE):
            clean = part.strip()
            if clean and len(clean) < 40:
                return clean
    # Fallback: first capitalised word-ish thing in body
    m = re.search(r"\b(Kaiser|Brielle|Whitecap|Marine Park|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b", body)
    return m.group(1) if m else None


def _build_venue_map() -> dict[str, str]:
    """Build date → venue from announcement messages."""
    if not CLASSIFIED.exists():
        return {}
    classified = json.loads(CLASSIFIED.read_text(encoding="utf-8"))
    venue_map: dict[str, str] = {}
    for mid, info in classified.items():
        if info["kind"] != "announcement":
            continue
        raw_path = RAW_DIR / f"{mid}.json"
        if not raw_path.exists():
            continue
        msg = json.loads(raw_path.read_text(encoding="utf-8"))
        subject = msg.get("subject", "")
        body = msg.get("body", "")
        venue = _parse_announcement_venue(subject, body)
        if not venue:
            continue
        # Parse date from subject
        m = re.match(r"(\w+),\s+(\w+)\s+(\d+)", subject.strip(), re.IGNORECASE)
        if m:
            month_word = m.group(2).lower()
            day_num = int(m.group(3))
            month_num = MONTH_MAP.get(month_word)
            if month_num:
                date_str = f"2026-{month_num:02d}-{day_num:02d}"
                venue_map[date_str] = venue
    return venue_map


def _resolve_game_names(game: dict) -> dict:
    """Run name resolution on all player names in the game object."""
    def r(name, ctx):
        if name is None:
            return None
        resolved = resolver_module.resolve(name, ctx)
        return resolved if resolved else name  # keep raw if unresolved

    context = game.get("id", "")

    game["rosters"] = [
        [r(n, context) for n in roster]
        for roster in game.get("rosters", [[], []])
    ]
    game["gk"] = [r(game["gk"][0], context), r(game["gk"][1], context)]
    game["goals"] = [
        {**goal,
         "scorer": r(goal.get("scorer"), context),
         "assist": r(goal.get("assist"), context)}
        for goal in game.get("goals", [])
    ]
    return game


def _build_players_list(games: list[dict]) -> list[dict]:
    """Collect all unique nicknames across all games into a players list."""
    seen: dict[str, str] = {}  # nickname → id
    for g in games:
        for roster in g.get("rosters", []):
            for name in roster:
                if name and name not in seen:
                    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
                    seen[name] = slug
        for goal in g.get("goals", []):
            for field in ("scorer", "assist"):
                name = goal.get(field)
                if name and name not in seen:
                    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
                    seen[name] = slug
        for gk in g.get("gk", []):
            if gk and gk not in seen:
                slug = re.sub(r"[^a-z0-9]+", "-", gk.lower()).strip("-")
                seen[gk] = slug

    return [{"id": slug, "nickname": nick} for nick, slug in sorted(seen.items(), key=lambda x: x[0])]


def run():
    resolver_module.reload()

    venue_map = _build_venue_map()
    print(f"[assemble] {len(venue_map)} venue mappings from announcements")

    extracted_files = sorted(EXTRACTED_DIR.glob("*.json"))
    print(f"[assemble] {len(extracted_files)} extracted game files")

    games: list[dict] = []
    for path in extracted_files:
        game = json.loads(path.read_text(encoding="utf-8"))
        # Skip extraction errors with no date
        if not game.get("date"):
            continue
        # Merge venue from announcement if missing
        if not game.get("venue") and game["date"] in venue_map:
            game["venue"] = venue_map[game["date"]]
        # Resolve player names
        game = _resolve_game_names(game)
        # Clean up internal fields
        game.pop("_score_discrepancy", None)
        game.pop("_extract_error", None)
        games.append(game)

    # Sort by date ascending
    games.sort(key=lambda g: g.get("date", ""))

    # Flush unresolved names to review queue
    resolver_module.flush_review()

    # Load existing aliases from current league.json (preserve manual corrections)
    existing_aliases = []
    if LEAGUE_JSON.exists():
        existing = json.loads(LEAGUE_JSON.read_text(encoding="utf-8"))
        existing_aliases = existing.get("aliases", [])

    players = _build_players_list(games)

    output = {
        "players": players,
        "aliases": existing_aliases,
        "games": games,
    }

    LEAGUE_JSON.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[assemble] wrote data/league.json: {len(players)} players, {len(games)} games")

    review_path = Path(__file__).parent / "review_queue.json"
    if review_path.exists():
        queue = json.loads(review_path.read_text(encoding="utf-8"))
        if queue:
            print(f"[assemble] {len(queue)} items in review_queue.json — check before publishing")


if __name__ == "__main__":
    run()
