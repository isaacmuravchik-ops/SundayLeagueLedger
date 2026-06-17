"""
Classifier — reads raw/<id>.json files and labels each message as one of:
  announcement | recap | stats | other

Heuristics based on subject line and attachment presence.
Ambiguous subjects fall back to a cheap Claude call.

Writes pipeline/classified.json: { message_id: { "kind": str, "subject": str, "date": str } }
"""

import json
import os
import re
from pathlib import Path

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

RAW_DIR = Path(__file__).parent / "raw"
OUTPUT = Path(__file__).parent / "classified.json"

# Days of week Vadim uses
DAYS = r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)"
MONTHS = r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"

# Bare recap: "Saturday, May 10" or "Sunday, June 7" — one comma, no time
RE_RECAP = re.compile(rf"^{DAYS},\s+{MONTHS}\s+\d{{1,2}}\s*$", re.IGNORECASE)

# Announcement: has am/pm or extra commas (venue, time)
RE_ANNOUNCE = re.compile(r"\b(?:am|pm)\b", re.IGNORECASE)
RE_VENUE_COMMA = re.compile(rf"{DAYS}.*?,.*?,", re.IGNORECASE)

# Stats: contains "stats" anywhere in subject
RE_STATS = re.compile(r"\bstats\b", re.IGNORECASE)

# Ignore: reply threads or explicit scheduling / cancellation words
RE_OTHER = re.compile(r"^Re:", re.IGNORECASE)
RE_CANCEL = re.compile(r"\b(?:cancel|reschedul|no\s+game|postpone)\b", re.IGNORECASE)

_client = None


def _anthropic():
    global _client
    if _client is None:
        _client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _client


def _claude_classify(subject: str, has_xlsx: bool) -> str:
    prompt = (
        f'Subject: "{subject}"\n'
        f'Has .xlsx attachment: {has_xlsx}\n\n'
        "Classify this email as exactly one of: announcement, recap, stats, other.\n"
        "Rules:\n"
        "- recap: bare weekday + date, no time, no attachment\n"
        "- announcement: weekday + venue + time (am/pm)\n"
        "- stats: contains 'stats' OR has .xlsx attachment\n"
        "- other: replies, cancellations, scheduling, anything else\n"
        "Reply with ONLY the single word."
    )
    msg = _anthropic().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=10,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip().lower()


def classify_subject(subject: str, has_xlsx: bool) -> str:
    if RE_OTHER.match(subject) or RE_CANCEL.search(subject):
        return "other"
    if RE_STATS.search(subject) or has_xlsx:
        return "stats"
    if RE_RECAP.match(subject.strip()):
        return "recap"
    if RE_ANNOUNCE.search(subject) or RE_VENUE_COMMA.search(subject):
        return "announcement"
    return None  # ambiguous → needs Claude


def run(use_claude_fallback: bool = True):
    existing = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {}

    raw_files = list(RAW_DIR.glob("*.json"))
    print(f"[classify] {len(raw_files)} raw messages, {len(existing)} already classified")

    results = dict(existing)
    new_count = 0
    claude_count = 0

    for path in raw_files:
        mid = path.stem
        if mid in existing:
            continue

        msg = json.loads(path.read_text(encoding="utf-8"))
        subject = msg.get("subject", "")
        has_xlsx = any(
            a.get("filename", "").endswith(".xlsx")
            for a in msg.get("attachments", [])
        )

        kind = classify_subject(subject, has_xlsx)

        if kind is None:
            if use_claude_fallback:
                kind = _claude_classify(subject, has_xlsx)
                claude_count += 1
            else:
                kind = "other"

        results[mid] = {
            "kind": kind,
            "subject": subject,
            "date": msg.get("date", ""),
        }
        new_count += 1

    OUTPUT.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[classify] done. {new_count} new, {claude_count} needed Claude fallback.")
    kinds = {}
    for v in results.values():
        kinds[v["kind"]] = kinds.get(v["kind"], 0) + 1
    for k, n in sorted(kinds.items()):
        print(f"  {k}: {n}")


if __name__ == "__main__":
    run()
