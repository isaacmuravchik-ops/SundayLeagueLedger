"""
Recap extractor — for each classified 'recap' message, calls Claude to
produce a structured game object matching the §2 schema.

Output: pipeline/extracted/<message_id>.json per game.
Low-confidence or score-mismatch games get needs_review: true.
"""

import json
import os
import re
from email.utils import parsedate_tz
from pathlib import Path

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

RAW_DIR = Path(__file__).parent / "raw"
CLASSIFIED = Path(__file__).parent / "classified.json"
EXTRACTED_DIR = Path(__file__).parent / "extracted"

DAYS_MAP = {
    "monday": "Mon", "tuesday": "Tue", "wednesday": "Wed",
    "thursday": "Thu", "friday": "Fri", "saturday": "Sat", "sunday": "Sun",
}

MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

SYSTEM_PROMPT = """You are a structured data extractor for a Brooklyn pickup soccer league.
Given a game recap email body, output ONLY a JSON object — no prose, no markdown fences.

Schema:
{
  "weekday": "Sat" | "Sun" | "Mon" | ...,
  "date": "YYYY-MM-DD",
  "season": <year as integer>,
  "venue": <string or null>,
  "team_labels": [<label for team 0>, <label for team 1>],
  "rosters": [[<team 0 names>], [<team 1 names>]],
  "gk": [<team 0 GK nickname or null>, <team 1 GK nickname or null>],
  "score": [<team 0 goals>, <team 1 goals>],
  "goals": [
    {"team": 0|1, "scorer": <nickname or null>, "assist": <nickname or null>, "og": false|true, "seq": <1-based>}
  ],
  "highlights": "<free text summary or empty string>",
  "confidence": "high" | "low",
  "needs_review": false | true
}

Rules:
- Infer which roster is "we" from the scoring narrative (not from order of appearance).
- Use player nicknames verbatim as they appear in the email.
- When a Goals: tally block is present, it is AUTHORITATIVE over prose.
- Own goals (og: true) still count toward the OPPOSING team's score total.
- If a scorer is unnamed but resolvable from context (e.g. "Leo's father"), include the best guess
  and set needs_review: true.
- Compute score by summing goals (counting og goals for the opposing team). If computed score
  does not match the stated final, set confidence: "low" and needs_review: true.
- If team labels like "Team RED" / "Team Blue" appear, use them in team_labels.
  Otherwise use "Team 1" / "Team 2".
- Never invent data — if something is unknown, use null.
"""


def _parse_date_from_subject(subject: str) -> tuple[str, str]:
    """Parse 'Saturday, May 10' → ('2026-05-10', 'Sat'). Returns (date_str, weekday)."""
    m = re.match(
        r"(\w+),\s+(\w+)\s+(\d+)",
        subject.strip(), re.IGNORECASE
    )
    if not m:
        return None, None
    day_word = m.group(1).lower()
    month_word = m.group(2).lower()
    day_num = int(m.group(3))
    weekday = DAYS_MAP.get(day_word, day_word[:3].capitalize())
    month_num = MONTH_MAP.get(month_word)
    if not month_num:
        return None, weekday
    # Assume current year; pipeline can be re-run for older seasons
    year = 2026
    date_str = f"{year}-{month_num:02d}-{day_num:02d}"
    return date_str, weekday


def _call_claude(body: str, subject: str, client: Anthropic) -> dict:
    prompt = f"Subject: {subject}\n\nBody:\n{body}"
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    text = msg.content[0].text.strip()
    # Strip any accidental markdown fences
    text = re.sub(r"^```[a-z]*\n?", "", text)
    text = re.sub(r"\n?```$", "", text)
    return json.loads(text)


def _validate(game: dict) -> dict:
    """Compute score from goals; flag mismatches."""
    computed = [0, 0]
    for goal in game.get("goals", []):
        if goal.get("og"):
            # own goal: credit the opposing team
            computed[1 - goal["team"]] += 1
        else:
            computed[goal["team"]] += 1

    stated = game.get("score", [None, None])
    if stated[0] is not None and tuple(computed) != tuple(stated):
        game["confidence"] = "low"
        game["needs_review"] = True
        game["_score_discrepancy"] = {"computed": computed, "stated": stated}
    return game


def _email_year(date_header: str) -> int | None:
    """Parse the year from a raw email Date header string."""
    if not date_header:
        return None
    parsed = parsedate_tz(date_header)
    return parsed[0] if parsed else None


def run(force: bool = False, year: int | None = None):
    EXTRACTED_DIR.mkdir(exist_ok=True)

    if not CLASSIFIED.exists():
        print("[extract] classified.json not found — run classify.py first")
        return

    classified = json.loads(CLASSIFIED.read_text(encoding="utf-8"))
    recaps = {mid: info for mid, info in classified.items() if info["kind"] == "recap"}

    if year:
        # Filter to only recaps whose email Date header matches the target year.
        # Falls back to subject-parsed year for emails with missing/unparseable headers.
        filtered = {}
        for mid, info in recaps.items():
            raw_path = RAW_DIR / f"{mid}.json"
            if not raw_path.exists():
                continue
            msg = json.loads(raw_path.read_text(encoding="utf-8"))
            email_yr = _email_year(msg.get("date", ""))
            if email_yr is None:
                # Try subject as fallback — recaps don't include year in subject,
                # so skip if we can't determine it
                continue
            if email_yr == year:
                filtered[mid] = info
        skipped = len(recaps) - len(filtered)
        recaps = filtered
        print(f"[extract] {len(recaps)} recap messages for {year} ({skipped} older emails skipped)")
    else:
        print(f"[extract] {len(recaps)} recap messages (all years — use --year YYYY to limit)")

    client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    new_count = 0
    review_needed = []

    for mid, info in recaps.items():
        out_path = EXTRACTED_DIR / f"{mid}.json"
        if out_path.exists() and not force:
            continue

        raw_path = RAW_DIR / f"{mid}.json"
        if not raw_path.exists():
            print(f"[extract] WARN: raw/{mid}.json missing, skipping")
            continue

        msg = json.loads(raw_path.read_text(encoding="utf-8"))
        body = msg.get("body", "")
        subject = msg.get("subject", "")

        if not body.strip():
            print(f"[extract] WARN: empty body for {mid} ({subject!r}), skipping")
            continue

        print(f"[extract] {subject!r} …")
        try:
            game = _call_claude(body, subject, client)
        except (json.JSONDecodeError, Exception) as e:
            print(f"[extract] ERROR for {mid}: {e}")
            game = {
                "confidence": "low", "needs_review": True,
                "_extract_error": str(e),
                "subject": subject,
            }

        # Fill date from subject if Claude didn't get it
        if not game.get("date"):
            date_str, weekday = _parse_date_from_subject(subject)
            if date_str:
                game["date"] = date_str
                game.setdefault("weekday", weekday)
                game.setdefault("season", int(date_str[:4]))

        game["id"] = game.get("date") or mid
        game = _validate(game)

        out_path.write_text(json.dumps(game, indent=2, ensure_ascii=False), encoding="utf-8")
        new_count += 1

        if game.get("needs_review"):
            review_needed.append({"id": game["id"], "subject": subject, "reason": game.get("_score_discrepancy") or "flagged"})

    # Write / update review queue
    review_path = Path(__file__).parent / "review_queue.json"
    existing_review = json.loads(review_path.read_text(encoding="utf-8")) if review_path.exists() else []
    existing_ids = {r["id"] for r in existing_review}
    for item in review_needed:
        if item["id"] not in existing_ids:
            existing_review.append(item)
    review_path.write_text(json.dumps(existing_review, indent=2), encoding="utf-8")

    print(f"[extract] done. {new_count} new extractions, {len(review_needed)} need review.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Re-extract already-processed recaps")
    parser.add_argument("--year", type=int, default=2026, help="Only extract recaps from this year (default: 2026)")
    parser.add_argument("--all-years", action="store_true", help="Extract recaps from all years (overrides --year)")
    args = parser.parse_args()
    run(force=args.force, year=None if args.all_years else args.year)
