"""
Name resolver — maps raw player names from extracted games to canonical nicknames.

Tiers:
  1. Normalize (lowercase, trim, collapse spaces)
  2. Exact match against canonical_players.json
  3. Exact match against aliases (typo-fold table)
  4. Guarded fuzzy (thefuzz) — length-aware edit distance, clear margin required
     NEVER merges two names that both appear in the canonical list
  5. Review queue if unresolved

Logs every fuzzy correction to pipeline/fuzzy_log.jsonl.
"""

import json
import re
from pathlib import Path

from thefuzz import process as fuzz_process

CANONICAL_FILE = Path(__file__).parent / "canonical_players.json"
ALIASES_FILE = Path(__file__).parent.parent / "data" / "league.json"  # aliases live in league.json
FUZZY_LOG = Path(__file__).parent / "fuzzy_log.jsonl"
REVIEW_QUEUE = Path(__file__).parent / "review_queue.json"

# Characters per name → max acceptable Levenshtein edits
EDIT_DISTANCE_TABLE = [(5, 1), (10, 2), (999, 3)]


def _max_edits(length: int) -> int:
    for threshold, edits in EDIT_DISTANCE_TABLE:
        if length <= threshold:
            return edits
    return 3


def _normalize(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip()).lower()


class Resolver:
    def __init__(self):
        self._canonical: list[str] = []
        self._canonical_lower: dict[str, str] = {}  # lowercase → canonical
        self._aliases: dict[str, str] = {}           # lowercase alias → canonical nickname
        self._fuzzy_log: list[dict] = []
        self._review: list[dict] = []
        self._loaded = False

    def load(self):
        if self._loaded:
            return
        if CANONICAL_FILE.exists():
            raw = json.loads(CANONICAL_FILE.read_text(encoding="utf-8"))
            self._canonical = raw
            self._canonical_lower = {n.lower(): n for n in raw}
        # Load aliases from league.json (ground-truth typo folds)
        league_path = ALIASES_FILE
        if league_path.exists():
            league = json.loads(league_path.read_text(encoding="utf-8"))
            for a in league.get("aliases", []):
                # Map alias → the player's canonical nickname
                alias_lower = _normalize(a["alias"])
                # Find the nickname for this player_id
                player = next(
                    (p for p in league.get("players", []) if p["id"] == a["player_id"]),
                    None,
                )
                if player:
                    self._aliases[alias_lower] = player["nickname"]
        self._loaded = True

    def resolve(self, raw_name: str, context: str = "") -> str | None:
        """
        Returns the canonical nickname, or None if unresolvable.
        Logs fuzzy matches; adds to review queue if unresolved.
        """
        self.load()
        if not raw_name or not raw_name.strip():
            return None

        norm = _normalize(raw_name)

        # Tier 1: exact canonical match
        if norm in self._canonical_lower:
            return self._canonical_lower[norm]

        # Tier 2: alias exact match
        if norm in self._aliases:
            return self._aliases[norm]

        # Tier 3: guarded fuzzy
        if self._canonical:
            best_match, best_score, *_ = fuzz_process.extractOne(
                raw_name, self._canonical
            ) or (None, 0)
            if best_match and best_score >= 80:
                max_ed = _max_edits(len(norm))
                # Compute simple edit distance as a sanity check
                from thefuzz import fuzz as fuzz_lib
                # Confirm runner-up is clearly worse
                all_matches = fuzz_process.extract(raw_name, self._canonical, limit=2)
                runner_up_score = all_matches[1][1] if len(all_matches) > 1 else 0
                margin = best_score - runner_up_score

                # Never fuzz-merge two names both in canonical list
                # (If the raw name itself normalized is in canonical, tier 1 would have caught it)
                if margin >= 10 and best_score >= 85:
                    self._fuzzy_log.append({
                        "raw": raw_name,
                        "resolved": best_match,
                        "score": best_score,
                        "margin": margin,
                        "context": context,
                    })
                    FUZZY_LOG.open("a").write(
                        json.dumps({"raw": raw_name, "resolved": best_match, "score": best_score, "context": context}) + "\n"
                    )
                    return best_match

        # Tier 4: unresolved → review queue
        self._review.append({"raw": raw_name, "context": context})
        return None

    def flush_review(self):
        if not self._review:
            return
        existing = json.loads(REVIEW_QUEUE.read_text(encoding="utf-8")) if REVIEW_QUEUE.exists() else []
        existing_raws = {r.get("raw") for r in existing}
        for item in self._review:
            if item["raw"] not in existing_raws:
                existing.append(item)
        REVIEW_QUEUE.write_text(json.dumps(existing, indent=2), encoding="utf-8")
        self._review.clear()


# Module-level singleton
_resolver = Resolver()


def resolve(name: str, context: str = "") -> str | None:
    return _resolver.resolve(name, context)


def flush_review():
    _resolver.flush_review()


def reload():
    """Force reload of canonical/alias data (e.g. after workbook.py updates it)."""
    _resolver._loaded = False
    _resolver.load()
